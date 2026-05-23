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
}

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
