namespace meat_calculator.Models;

/// <summary>Study presets — "balanced" uses midpoints between juicy (low pull) and traditional (hot pull) anchors.</summary>
public static class CookProfiles
{
    public const string JuicyId = "juicy";
    public const string BalancedId = "balanced";
    public const string TraditionalId = "traditional";

    public static double Midpoint(double low, double high) =>
        Math.Round((low + high) / 2, 1);

    public static readonly CookProfile Juicy = new(
        JuicyId,
        "Juicy",
        "Pull early, finish in hold",
        BrisketData.PullLongHoldC,
        BrisketData.HoldLongC,
        35,
        "us_choice",
        BrisketData.PitTempStartC,
        BrisketData.PitTempBoostC,
        100,
        "Pull at 90.5 °C (~40% tenderness) — most juice, longest hold.");

    public static readonly CookProfile Traditional = new(
        TraditionalId,
        "Hotter pull",
        "Classic done temp on the pit",
        BrisketData.PullTraditionalC,
        BrisketData.HoldLongC,
        40,
        "us_choice",
        BrisketData.PitTempStartMaxC,
        BrisketData.PitTempBoostC,
        100,
        "Pull around 95 °C — more done on the pit, higher dryness risk in the model.");

    public static readonly CookProfile Balanced = new(
        BalancedId,
        "In between",
        "Midpoint of juicy & hotter pull",
        Midpoint(BrisketData.PullLongHoldC, BrisketData.PullTraditionalC),
        BrisketData.HoldLongC,
        Midpoint(35, 40),
        "us_choice",
        Midpoint(BrisketData.PitTempStartC, BrisketData.PitTempStartMaxC),
        BrisketData.PitTempBoostC,
        100,
        $"Pull ~{Midpoint(BrisketData.PullLongHoldC, BrisketData.PullTraditionalC)} °C — halfway between 90.5 and 95 °C, same 65.5 °C hold.");

    public static readonly CookProfile[] All = [Juicy, Balanced, Traditional];

    public static CookProfile? Get(string? id) =>
        All.FirstOrDefault(p => string.Equals(p.Id, id, StringComparison.OrdinalIgnoreCase));
}

public sealed record CookProfile(
    string Id,
    string Name,
    string Subtitle,
    double PullTempC,
    double HoldTempC,
    double LossPercent,
    string GradeId,
    double PitStartC,
    double PitBoostC,
    double TargetPercent,
    string Rationale);

public sealed record ProfileComparison(
    CookProfile Profile,
    double PullTempC,
    double PullTempF,
    double EstimatedRenderedAtPull,
    double HoldHoursEstimate,
    string MoistureRisk);
