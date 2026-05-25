using meat_calculator.Models;

namespace meat_calculator.Services;

public sealed class BrisketEngine
{
    RestProjectionEngine? _rest;

    public void ConfigureRest(RestProjectionEngine rest) => _rest = rest;

    public RenderingStage GetStageForTemp(double tempC)
    {
        if (tempC < 60) return BrisketData.RenderingStages[0] with { PercentPerHour = 0, Multiplier = 0 };
        RenderingStage? best = null;
        foreach (var stage in BrisketData.RenderingStages)
        {
            if (tempC >= stage.TempC) best = stage;
            else break;
        }
        return best ?? BrisketData.RenderingStages[0];
    }

    public double EstimateRenderedAtPull(double pullTempC)
    {
        if (pullTempC < 60) return 0;
        var anchors = BrisketData.PullAnchors;
        if (pullTempC <= anchors[0].TempC) return anchors[0].RenderedPercent;
        if (pullTempC >= anchors[^1].TempC) return anchors[^1].RenderedPercent;

        for (var i = 0; i < anchors.Length - 1; i++)
        {
            var (t0, p0) = anchors[i];
            var (t1, p1) = anchors[i + 1];
            if (pullTempC >= t0 && pullTempC <= t1)
            {
                var t = (pullTempC - t0) / (t1 - t0);
                return p0 + t * (p1 - p0);
            }
        }
        return anchors[^1].RenderedPercent;
    }

    static bool IsJuicyLongHoldPair(double pullTempC, double holdTempC) =>
        Math.Abs(pullTempC - BrisketData.PullLongHoldC) < 1.5 &&
        Math.Abs(holdTempC - BrisketData.HoldLongC) < 1.5;

    public HoldPlan CalculateHoldPlan(double pullTempC, double holdTempC, double? targetPercent = null)
    {
        var target = targetPercent ?? 100;
        var renderedAtPull = EstimateRenderedAtPull(pullTempC);

        var carryOver = 0.0;
        var carrySteps = new List<CarryStep>();
        var cooldownHours = 0.0;
        if (holdTempC < pullTempC - BrisketData.CarryEndMarginC)
        {
            var rest = _rest ?? throw new InvalidOperationException("RestProjectionEngine not configured.");
            var cooldown = rest.ComputeHoldCooldown(pullTempC, holdTempC, renderedAtPull);
            carryOver = cooldown.CarryAdded;
            carrySteps = cooldown.CarrySteps.ToList();
            cooldownHours = cooldown.CooldownHours;

            var holdStageEarly = GetStageForTemp(holdTempC);
            var holdRateEarly = holdTempC >= 60 ? holdStageEarly.PercentPerHour : 0;
            if (holdRateEarly > 0 && IsJuicyLongHoldPair(pullTempC, holdTempC))
            {
                var remainingFromPull = Math.Max(0, target - renderedAtPull);
                var steadyBudget = Math.Max(0, BrisketData.HoldLongHoursTypical - cooldownHours);
                var maxCarry = Math.Max(0, remainingFromPull - steadyBudget * holdRateEarly);
                carryOver = Math.Min(carryOver, maxCarry);
            }
        }

        var afterCarry = renderedAtPull + carryOver;
        var stillNeeded = Math.Max(0, target - afterCarry);
        var holdStage = GetStageForTemp(holdTempC);
        var holdRate = holdTempC >= 60 ? holdStage.PercentPerHour : 0;
        var holdHours = holdRate > 0 ? stillNeeded / holdRate : double.PositiveInfinity;
        var projectedFinal = holdRate > 0
            ? afterCarry + holdHours * holdRate
            : afterCarry;

        double? holdHoursLow = null;
        double? holdHoursHigh = null;
        if (!double.IsInfinity(holdHours) && holdHours > 0)
        {
            holdHoursLow = Math.Round(holdHours * 0.85, 1);
            holdHoursHigh = Math.Round(holdHours * 1.20, 1);
        }

        return new HoldPlan(
            pullTempC,
            holdTempC,
            target,
            renderedAtPull,
            carryOver,
            carrySteps,
            afterCarry,
            stillNeeded,
            holdRate,
            holdHours,
            projectedFinal,
            cooldownHours,
            holdHoursLow,
            holdHoursHigh);
    }

    public static (double Low, double High) RenderBand(double renderPct)
    {
        var mid = Math.Clamp(renderPct, 0, 120);
        return (Math.Round(mid * 0.9, 1), Math.Min(100, Math.Round(mid * 1.1, 1)));
    }

    public static GradeInfo ResolveGrade(string? grade)
    {
        var normalized = NormalizeGradeKey(grade);
        return BrisketData.Grades.FirstOrDefault(g =>
            g.Id.Equals(normalized, StringComparison.OrdinalIgnoreCase) ||
            g.Name.Equals(normalized, StringComparison.OrdinalIgnoreCase))
            ?? BrisketData.Grades.First(g => g.Id == BrisketData.DefaultGradeId);
    }

    static string NormalizeGradeKey(string? grade)
    {
        if (string.IsNullOrWhiteSpace(grade)) return "";
        var key = grade.Trim();
        return key.ToLowerInvariant() switch
        {
            "fk2" or "select" or "usda select" or "fettklass 2" => "us_select",
            "fk34" or "choice" or "usda choice" or "fettklass 3–4" or "fettklass 3-4" => "us_choice",
            "fk45" or "prime" or "usda prime" or "fettklass 4–5" or "fettklass 4-5" => "us_prime",
            "jp_bms23" or "jp_bms2" => "jp_bms34",
            "jp_bms46" or "jp_bms4" => "jp_bms57",
            "jp_bms8" => "jp_bms812",
            _ => key
        };
    }

    public YieldEstimate CalculateYield(double startWeightKg, string grade, double lossPercent)
    {
        var gradeInfo = ResolveGrade(grade);
        var cooked = startWeightKg * (1 - lossPercent / 100);
        return new YieldEstimate(
            startWeightKg,
            gradeInfo.Id,
            gradeInfo.Name,
            gradeInfo.Region,
            gradeInfo.RegionLabel,
            gradeInfo.MarblingBand,
            gradeInfo.MarblingBandLabel,
            gradeInfo.MarblingMin,
            gradeInfo.MarblingMax,
            lossPercent,
            cooked,
            startWeightKg - cooked,
            BrisketData.WaterContentPercent);
    }

    public PullComparison ComparePullStrategy(double pullTempC)
    {
        var rendered = EstimateRenderedAtPull(pullTempC);
        var stage = GetStageForTemp(pullTempC);
        var inMoistureTrap = pullTempC >= BrisketData.MoistureTrapC;
        var risk = pullTempC switch
        {
            >= 95 => "High — classic “done” pull can ring out moisture at 95–96 °C (203–205 °F)",
            >= 93.3 => "Elevated — in the 93 °C+ (200 °F) moisture trap",
            >= 90.5 => "Moderate — pull-and-hold window around 90.5 °C (195 °F)",
            _ => "Lower heat — more hold time needed for tenderness"
        };
        return new PullComparison(pullTempC, rendered, 100 - rendered, stage.Multiplier, inMoistureTrap, risk);
    }

    public LongHoldStory BuildLongHoldStory()
    {
        var plan = CalculateHoldPlan(BrisketData.PullLongHoldC, BrisketData.HoldLongC, 100);
        var pull195 = ComparePullStrategy(BrisketData.PullLongHoldC);
        var pull203 = ComparePullStrategy(BrisketData.PullTraditionalC);
        return new LongHoldStory(pull195, pull203, plan);
    }

    public CookTimeline BuildStandardTimeline()
    {
        return new CookTimeline(
            PitLowHours: BrisketData.PitLowHours,
            PitStartC: BrisketData.PitTempStartC,
            PitBoostC: BrisketData.PitTempBoostC,
            StallMinC: BrisketData.StallMinC,
            StallMaxC: BrisketData.StallMaxC,
            CookHoursMin: 10,
            CookHoursMax: 12,
            Phases:
            [
                new TimelinePhase("Smoke", 0, 5, BrisketData.PitTempStartC, "Low & slow — bark formation"),
                new TimelinePhase("Stall zone", 5, 8, BrisketData.PitTempStartC, "65.5–74°C internal — evaporative cooling"),
                new TimelinePhase("Power through", 8, 12, BrisketData.PitTempBoostC, "Bump pit to 149°C after stall")
            ]);
    }
}

public sealed record CarryStep(
    double TempC,
    double Hours,
    double RatePerHour,
    double AddedPercent,
    string? Label = null);

public sealed record HoldPlan(
    double PullTempC,
    double HoldTempC,
    double TargetPercent,
    double RenderedAtPull,
    double CarryOverAdded,
    IReadOnlyList<CarryStep> CarrySteps,
    double AfterCarryover,
    double RemainingAtHold,
    double HoldRatePerHour,
    double HoldHours,
    double ProjectedFinal,
    double CooldownHours,
    double? HoldHoursLow = null,
    double? HoldHoursHigh = null);

public sealed record YieldEstimate(
    double StartKg,
    string GradeId,
    string Grade,
    string GradeRegion,
    string GradeRegionLabel,
    string MarblingBand,
    string MarblingBandLabel,
    double MarblingMin,
    double MarblingMax,
    double LossPercent,
    double CookedKg,
    double LostKg,
    double WaterContentPercent);

public sealed record TimelinePhase(string Name, double StartHour, double EndHour, double PitTempC, string Note);

public sealed record PullComparison(
    double PullTempC,
    double RenderedPercent,
    double RemainingPercent,
    int RenderingMultiplier,
    bool InMoistureTrap,
    string MoistureRisk);

public sealed record LongHoldStory(
    PullComparison Pull195,
    PullComparison Pull203,
    HoldPlan HoldPlan);

public sealed record CookTimeline(
    int PitLowHours,
    double PitStartC,
    double PitBoostC,
    double StallMinC,
    double StallMaxC,
    int CookHoursMin,
    int CookHoursMax,
    IReadOnlyList<TimelinePhase> Phases);
