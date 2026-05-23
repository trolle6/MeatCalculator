using meat_calculator.Models;

namespace meat_calculator.Services;

public sealed class RestProjectionEngine(BrisketEngine brisket)
{
    public RestProjection Predict(
        double startTempC,
        double ambientTempC,
        double durationHours,
        double tauHours,
        double? startRenderedPercent = null)
    {
        var rendered = startRenderedPercent ?? brisket.EstimateRenderedAtPull(startTempC);
        var steps = new List<RestStep>();
        var temp = startTempC;
        var elapsed = 0.0;
        const double stepH = 0.5;

        while (elapsed < durationHours - 0.0001)
        {
            var dt = Math.Min(stepH, durationHours - elapsed);
            var tempStart = temp;
            var tempEnd = TempAtTime(tempStart, ambientTempC, tauHours, dt);
            var tempAvg = (tempStart + tempEnd) / 2;
            var rate = brisket.GetStageForTemp(tempAvg).PercentPerHour;
            var added = rate * dt;
            rendered = Math.Min(130, rendered + added);
            elapsed += dt;
            temp = tempEnd;
            steps.Add(new RestStep(Math.Round(elapsed, 2), Math.Round(tempEnd, 1), Math.Round(added, 2), Math.Round(rendered, 1)));
        }

        return new RestProjection(
            Math.Round(startTempC, 1),
            Math.Round(ambientTempC, 1),
            Math.Round(durationHours, 2),
            Math.Round(tauHours, 2),
            Math.Round(temp, 1),
            Math.Round(rendered, 1),
            startRenderedPercent ?? brisket.EstimateRenderedAtPull(startTempC),
            steps);
    }

    public static double TempAtTime(double startTempC, double ambientTempC, double tauHours, double hours)
    {
        if (tauHours <= 0) return ambientTempC;
        return ambientTempC + (startTempC - ambientTempC) * Math.Exp(-hours / tauHours);
    }

    /// <summary>τ so internal reaches hold + margin after <paramref name="durationHours"/> of exponential cool.</summary>
    public static double SolveTauForCooldown(
        double pullTempC,
        double ambientTempC,
        double durationHours,
        double endTargetC)
    {
        if (durationHours <= 0 || pullTempC <= ambientTempC + 0.01)
            return BrisketData.HoldCarryTauDefault;

        var ratio = (endTargetC - ambientTempC) / (pullTempC - ambientTempC);
        if (ratio <= 0 || ratio >= 1)
            return BrisketData.HoldCarryTauDefault;

        return -durationHours / Math.Log(ratio);
    }

    public HoldCooldownResult ComputeHoldCooldown(double pullTempC, double holdTempC, double renderedAtPull)
    {
        var duration = BrisketData.CarryCooldownHoursTypical;
        var endTarget = holdTempC + BrisketData.CarryEndMarginC;
        var solvedTau = SolveTauForCooldown(pullTempC, holdTempC, duration, endTarget);
        // Slower cool (larger τ) keeps internal hotter longer → more render during carry-over.
        var tau = Math.Max(solvedTau, BrisketData.HoldCarryTauDefault);
        var projection = Predict(pullTempC, holdTempC, duration, tau, renderedAtPull);
        var integrated = Math.Max(0, projection.EndRenderedPercent - projection.StartRenderedPercent);
        var carryAdded = Math.Max(integrated, EstimateLegacyBandCarry(pullTempC, holdTempC));
        var carrySteps = AggregateCarrySteps(projection.Steps, duration, carryAdded);
        return new HoldCooldownResult(carryAdded, duration, tau, projection.EndTempC, carrySteps);
    }

    /// <summary>Legacy band sum — floor so juicy pull/hold matches teaching (~35% carry at 90.5→65.5).</summary>
    public static double EstimateLegacyBandCarry(double pullTempC, double holdTempC)
    {
        if (holdTempC >= pullTempC - BrisketData.CarryEndMarginC)
            return 0;

        var sum = 0.0;
        foreach (var (tempC, hours, rate) in BrisketData.CarryOverLegacyBands)
        {
            if (tempC > pullTempC) continue;
            if (tempC < holdTempC) break;
            sum += hours * rate;
        }

        return sum;
    }

    List<CarryStep> AggregateCarrySteps(IReadOnlyList<RestStep> steps, double durationHours, double totalAdded)
    {
        if (steps.Count == 0)
        {
            return
            [
                new CarryStep(0, durationHours, 0, Math.Round(totalAdded, 1),
                    "~4 hr cool-down into hold")
            ];
        }

        var byStage = new SortedDictionary<double, double>(Comparer<double>.Create((a, b) => b.CompareTo(a)));
        foreach (var step in steps)
        {
            var stageTemp = brisket.GetStageForTemp(step.TempC).TempC;
            byStage[stageTemp] = byStage.GetValueOrDefault(stageTemp) + step.RenderingAdded;
        }

        var rows = byStage
            .Where(kv => kv.Value > 0.05)
            .Select(kv =>
            {
                var rate = brisket.GetStageForTemp(kv.Key).PercentPerHour;
                return new CarryStep(kv.Key, 0, rate, Math.Round(kv.Value, 1), null);
            })
            .ToList();

        return rows.Count > 0
            ? rows
            : [new CarryStep(0, durationHours, 0, Math.Round(totalAdded, 1), "~4 hr cool-down into hold")];
    }
}

public sealed record HoldCooldownResult(
    double CarryAdded,
    double CooldownHours,
    double TauHours,
    double EndTempC,
    IReadOnlyList<CarryStep> CarrySteps);

public sealed record RestStep(double Hour, double TempC, double RenderingAdded, double RenderingTotal);

public sealed record RestProjection(
    double StartTempC,
    double AmbientTempC,
    double DurationHours,
    double TauHours,
    double EndTempC,
    double EndRenderedPercent,
    double StartRenderedPercent,
    IReadOnlyList<RestStep> Steps);
