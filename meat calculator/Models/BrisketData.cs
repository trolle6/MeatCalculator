namespace meat_calculator.Models;

public sealed record RenderingStage(
    double TempC,
    double TempF,
    int Multiplier,
    double HoursTo100,
    double PercentPerHour);

public sealed record MarblingBandInfo(string Id, string Label, int Order);

public sealed record GradeInfo(
    string Id,
    string Name,
    string Region,
    string RegionLabel,
    string MarblingBand,
    string MarblingBandLabel,
    int Tier,
    double MarblingMin,
    double MarblingMax,
    string? Note = null);

public static class BrisketData
{
    public const double WaterContentPercent = 70;
    public const double WeightLossMin = 30;
    public const double WeightLossMax = 40;
    public const double WeightLossMaxJuicy = 43;

    public const double PitTempStartC = 121;
    public const double PitTempStartMaxC = 135;
    public const double PitTempStartF = 250;
    public const double PitTempStartMaxF = 275;
    public const double FatCapThicknessCm = 0.6;
    public const double SmokeRingMaxC = 76.5;
    public const double SmokeRingMaxF = 170;
    public const double BlacksHoldC = 82;
    public const double BlacksHoldF = 180;
    public const int CounterRestHoursHotFinish = 2;
    public const double PitTempBoostC = 149;
    public const double PitTempBoostF = 300;
    public const int PitLowHours = 5;

    public const double StallMinC = 65.5;
    public const double StallMaxC = 74;
    public const double StallMinF = 150;
    public const double StallMaxF = 165;

    public const double PullLongHoldC = 90.5;
    public const double PullLongHoldF = 195;
    public const double PullTraditionalF = 203;
    public const double PullTraditionalC = 95;
    public const double PullTraditionalMaxC = 96;
    public const double BlacksFinishC = 93;
    public const double BlacksFinishF = 200;
    public const double TrimSideCm = 1.3;
    public const double WaterPanTestC = 88;
    public const double OvenDialMinTypicalC = 76.5;
    public const int HoldLongHoursTypical = 18;
    public const double ProbeLandmarkC = 82;
    public const double FoilBoatFinishMinC = 95;
    public const double FoilBoatFinishMaxC = 96;

    public const double ConfitSmokeTargetC = 74;
    public const double ConfitTallowC = 68.3;
    public const int ConfitTallowHours = 18;

    public const double ReverseSmokePullC = 88;
    public const double ReverseReheatPitC = 121;
    public const double ReverseReheatTargetC = 65.5;

    public const double DoneMinPercent = 80;
    public const double DoneMaxPercent = 120;
    public const double MoistureTrapC = 93.3;
    public const double MoistureTrapF = 200;

    public const double HoldLongC = 65.5;
    public const double HoldLongF = 150;
    public const int HoldLongHoursMin = 12;
    public const int HoldLongHoursMax = 18;
    public const double PullLongHoldRendered = 40;
    public const double HoldFinishesRendered = 60;

    public const double SafeMinC = 55;
    public const double HoldRecommendedMinC = 57;
    public const double HoldRecommendedMaxC = 60;

    /// <summary>Modeled hours for pull temp to settle toward hold temp in cambro (carry-over phase).</summary>
    public const double CarryCooldownHoursTypical = 4;

    /// <summary>Internal temp within this margin of hold counts as "at hold" for τ solve.</summary>
    public const double CarryEndMarginC = 0.5;

    /// <summary>Fallback τ (hours) when pull ≈ hold or ratio is degenerate.</summary>
    public const double HoldCarryTauDefault = 2;

    /// <summary>Legacy carry bands — floor so 90.5→65.5 stays ~35% with rest integration.</summary>
    public static readonly (double TempC, double Hours, double RatePerHour)[] CarryOverLegacyBands =
    [
        (88, 1, 18),
        (82, 1, 9),
        (76.5, 1, 5),
        (71, 1, 3)
    ];

    /// <summary>Simple marbling bands; regional stickers map to these for planning (USDA default).</summary>
    public static readonly MarblingBandInfo[] MarblingScale =
    [
        new("low", "Low marbling", 0),
        new("low-moderate", "Low–moderate marbling", 1),
        new("moderate", "Moderate marbling", 2),
        new("high", "High marbling", 3),
        new("extreme", "Extreme / Wagyu-grade marbling", 4)
    ];

    public static readonly GradeInfo[] Grades =
    [
        new("us_select", "USDA Select", "us", "United States (USDA)", "low-moderate", "Low–moderate marbling", 0, 2, 6),
        new("us_choice", "USDA Choice", "us", "United States (USDA)", "moderate", "Moderate marbling", 1, 4, 10),
        new("us_prime", "USDA Prime", "us", "United States (USDA)", "high", "High marbling", 2, 8, 13),
        new("uk_fat2", "Fat class 2", "uk", "United Kingdom", "low", "Low marbling", 0, 2, 4),
        new("uk_fat34", "Fat class 3–4", "uk", "United Kingdom", "moderate", "Moderate marbling", 1, 4, 10),
        new("uk_fat45", "Fat class 4–5", "uk", "United Kingdom", "high", "High marbling", 2, 8, 13),
        new("jp_bms34", "BMS 3–4", "jp", "Japan (JMGA BMS)", "moderate", "Moderate marbling", 1, 4, 10),
        new("jp_bms57", "BMS 5–7", "jp", "Japan (JMGA BMS)", "high", "High marbling", 2, 8, 12),
        new("jp_bms812", "BMS 8–12", "jp", "Japan (JMGA BMS)", "extreme", "Extreme / Wagyu-grade marbling", 3, 10, 20),
        new("au_msa300", "MSA 300", "au", "Australia (MSA)", "moderate", "Moderate marbling", 1, 4, 10),
        new("au_msa400", "MSA 400", "au", "Australia (MSA)", "high", "High marbling", 2, 8, 13),
        new("au_msa500", "MSA 500+", "au", "Australia (MSA)", "extreme", "Extreme / Wagyu-grade marbling", 3, 10, 20)
    ];

    public const string DefaultGradeId = "us_choice";

    public static readonly RenderingStage[] RenderingStages =
    [
        new(60, 140, 1, 75, 1),
        new(65.5, 150, 2, 37.5, 2),
        new(71, 160, 3, 25, 3),
        new(76.5, 170, 5, 15, 5),
        new(82, 180, 9, 9, 9),
        new(88, 190, 18, 5.5, 18),
        new(90.5, 195, 25, 4, 25),
        new(93.3, 200, 35, 2.9, 35),
        new(99, 210, 75, 1.3, 75)
    ];

    /// <summary>Estimated % collagen rendered when pulled at this internal temp (anchors from source).</summary>
    public static readonly (double TempC, double RenderedPercent)[] PullAnchors =
    [
        (60, 5),
        (76.5, 20),
        (90.5, 40),
        (93.3, 55),
        (99, 75)
    ];

}
