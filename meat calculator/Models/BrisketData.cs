namespace meat_calculator.Models;

public sealed record RenderingStage(
    double TempC,
    double TempF,
    int Multiplier,
    double HoursTo100,
    double PercentPerHour);

public sealed record GradeInfo(
    string Id,
    string Name,
    string Region,
    string RegionLabel,
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

    public const double PorkLoinTargetC = 63;
    public const double PorkLoinPitC = 215;
    public const double PorkLoinPitF = 420;

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

    /// <summary>Regional grading systems; marbling bands are planning references (USDA default).</summary>
    public static readonly GradeInfo[] Grades =
    [
        new("us_select", "USDA Select", "us", "United States (USDA)", 0, 2, 4, "Scored on ribeye, not brisket"),
        new("us_choice", "USDA Choice", "us", "United States (USDA)", 1, 4, 10, "Scored on ribeye, not brisket"),
        new("us_prime", "USDA Prime", "us", "United States (USDA)", 2, 8, 13, "Scored on ribeye, not brisket"),
        new("uk_fat2", "Fat class 2", "uk", "United Kingdom", 0, 2, 4, "Carcass fat class — rough marbling band"),
        new("uk_fat34", "Fat class 3–4", "uk", "United Kingdom", 1, 4, 10, "Carcass fat class — rough marbling band"),
        new("uk_fat45", "Fat class 4–5", "uk", "United Kingdom", 2, 8, 13, "Carcass fat class — rough marbling band"),
        new("jp_bms23", "BMS 2–3", "jp", "Japan (JMGA BMS)", 0, 2, 4, "Beef Marbling Standard"),
        new("jp_bms46", "BMS 4–6", "jp", "Japan (JMGA BMS)", 1, 4, 10, "Beef Marbling Standard"),
        new("jp_bms8", "BMS 8+", "jp", "Japan (JMGA BMS)", 2, 8, 13, "Beef Marbling Standard"),
        new("au_msa300", "MSA marbling ~300", "au", "Australia (MSA)", 0, 2, 4, "MSA marbling score — approximate"),
        new("au_msa400", "MSA marbling ~400", "au", "Australia (MSA)", 1, 4, 10, "MSA marbling score — approximate"),
        new("au_msa500", "MSA marbling ~500+", "au", "Australia (MSA)", 2, 8, 13, "MSA marbling score — approximate")
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

    public static readonly (double TempC, double Hours, double PercentPerHour)[] CarryOverDecline =
    [
        (88, 1, 18),
        (82, 1, 9),
        (76.5, 1, 5),
        (71, 1, 3)
    ];
}
