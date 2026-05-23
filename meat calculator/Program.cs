using meat_calculator.Models;
using meat_calculator.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<BrisketEngine>();
builder.Services.AddSingleton<RestProjectionEngine>();

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

var engine = app.Services.GetRequiredService<BrisketEngine>();
var restEngine = app.Services.GetRequiredService<RestProjectionEngine>();

app.MapGet("/api/data", () => new
{
    grades = BrisketData.Grades,
    stages = BrisketData.RenderingStages,
    constants = new
    {
        pitStartC = BrisketData.PitTempStartC,
        pitBoostC = BrisketData.PitTempBoostC,
        stallMinC = BrisketData.StallMinC,
        stallMaxC = BrisketData.StallMaxC,
        pullLongHoldC = BrisketData.PullLongHoldC,
        pullLongHoldF = BrisketData.PullLongHoldF,
        pullTraditionalF = BrisketData.PullTraditionalF,
        moistureTrapC = BrisketData.MoistureTrapC,
        moistureTrapF = BrisketData.MoistureTrapF,
        holdLongC = BrisketData.HoldLongC,
        holdLongHoursMin = BrisketData.HoldLongHoursMin,
        holdLongHoursMax = BrisketData.HoldLongHoursMax,
        pullRendered = BrisketData.PullLongHoldRendered,
        holdFinishes = BrisketData.HoldFinishesRendered,
        doneMin = BrisketData.DoneMinPercent,
        doneMax = BrisketData.DoneMaxPercent
    }
});

app.MapGet("/api/science", () =>
{
    var story = engine.BuildLongHoldStory();
    var highlights = new[]
    {
        BrisketData.RenderingStages.First(s => Math.Abs(s.TempC - 60) < 0.1),
        BrisketData.RenderingStages.First(s => Math.Abs(s.TempC - 88) < 0.1),
        BrisketData.RenderingStages.First(s => Math.Abs(s.TempC - 93.3) < 0.1)
    };
    return new
    {
        title = "Why 90.5 °C pull beats 95 °C",
        titleAlt = "(195 °F vs 203 °F)",
        moistureTrap = new
        {
            tempC = BrisketData.MoistureTrapC,
            tempF = BrisketData.MoistureTrapF,
            summary = "Above 93 °C (200 °F), muscle fibres contract rapidly and squeeze out water faster than fat and gelatin can compensate."
        },
        renderingHighlights = highlights,
        pull195 = MapComparison(story.Pull195),
        pull203 = MapComparison(story.Pull203),
        method = new
        {
            pullC = BrisketData.PullLongHoldC,
            pullF = BrisketData.PullLongHoldF,
            holdC = BrisketData.HoldLongC,
            holdF = BrisketData.HoldLongF,
            holdHoursMin = BrisketData.HoldLongHoursMin,
            holdHoursMax = BrisketData.HoldLongHoursMax,
            renderedAtPull = BrisketData.PullLongHoldRendered,
            finishedInHold = BrisketData.HoldFinishesRendered,
            probeCue = "Probe should feel slightly tight — not butter-tender yet.",
            holdNote = "Muscle fibers relax and reabsorb juice while collagen finishes gently."
        },
        holdPlan = new
        {
            story.HoldPlan.RenderedAtPull,
            story.HoldPlan.CarryOverAdded,
            story.HoldPlan.AfterCarryover,
            holdHours = double.IsInfinity(story.HoldPlan.HoldHours) ? (double?)null : Math.Round(story.HoldPlan.HoldHours, 1),
            totalHours = Math.Round(story.HoldPlan.CarrySteps.Sum(s => s.Hours) + (double.IsInfinity(story.HoldPlan.HoldHours) ? 0 : story.HoldPlan.HoldHours), 1)
        },
        fatNote = "Fettklass 4–5 (Prime) or Wangus fat can mask dry fibres — it cannot fix structural dryness from a 95 °C+ overcook.",
        smokeMyth = "Smoke and smoke-ring development do not stop at 60 °C (140 °F); they continue well past 76.5 °C (170 °F)."
    };
});

static object MapComparison(PullComparison c) => new
{
    c.PullTempC,
    pullTempF = CToF(c.PullTempC),
    c.RenderedPercent,
    c.RemainingPercent,
    c.RenderingMultiplier,
    c.InMoistureTrap,
    c.MoistureRisk
};

app.MapGet("/api/rendering/{tempC:double}", (double tempC) =>
{
    var stage = engine.GetStageForTemp(tempC);
    var rendered = engine.EstimateRenderedAtPull(tempC);
    return new
    {
        tempC,
        tempF = CToF(tempC),
        stage,
        estimatedRenderedAtPull = Math.Round(rendered, 1),
        hoursTo100FromHere = stage.PercentPerHour > 0 ? Math.Round(100 / stage.PercentPerHour, 1) : (double?)null,
        inDoneRange = rendered >= BrisketData.DoneMinPercent && rendered <= BrisketData.DoneMaxPercent
    };
});

app.MapPost("/api/hold", (HoldRequest req) =>
{
    var plan = engine.CalculateHoldPlan(req.PullTempC, req.HoldTempC, req.TargetPercent ?? 100);
    return new
    {
        plan.PullTempC,
        pullTempF = CToF(plan.PullTempC),
        plan.HoldTempC,
        holdTempF = CToF(plan.HoldTempC),
        plan.TargetPercent,
        plan.RenderedAtPull,
        plan.CarryOverAdded,
        carrySteps = plan.CarrySteps.Select(s => new
        {
            s.TempC,
            tempF = CToF(s.TempC),
            s.Hours,
            s.RatePerHour,
            s.AddedPercent
        }),
        plan.AfterCarryover,
        plan.RemainingAtHold,
        plan.HoldRatePerHour,
        holdHours = double.IsInfinity(plan.HoldHours) ? (double?)null : Math.Round(plan.HoldHours, 1),
        plan.ProjectedFinal,
        totalHours = plan.CarrySteps.Sum(s => s.Hours) + (double.IsInfinity(plan.HoldHours) ? 0 : plan.HoldHours)
    };
});

app.MapPost("/api/yield", (YieldRequest req) =>
{
    var est = engine.CalculateYield(req.WeightKg, req.Grade ?? "fk34", req.LossPercent ?? 35);
    return est;
});

app.MapGet("/api/timeline", () => engine.BuildStandardTimeline());

app.MapGet("/api/profiles", () =>
{
    var profiles = CookProfiles.All.Select(p =>
    {
        var plan = engine.CalculateHoldPlan(p.PullTempC, p.HoldTempC, p.TargetPercent);
        var pull = engine.ComparePullStrategy(p.PullTempC);
        var holdHrs = double.IsInfinity(plan.HoldHours) ? (double?)null : Math.Round(plan.HoldHours, 1);
        return new
        {
            p.Id,
            p.Name,
            p.Subtitle,
            pullTempC = p.PullTempC,
            pullTempF = CToF(p.PullTempC),
            holdTempC = p.HoldTempC,
            holdTempF = CToF(p.HoldTempC),
            lossPercent = p.LossPercent,
            gradeId = p.GradeId,
            pitStartC = p.PitStartC,
            pitBoostC = p.PitBoostC,
            targetPercent = p.TargetPercent,
            p.Rationale,
            estimatedRenderedAtPull = Math.Round(pull.RenderedPercent, 0),
            moistureRisk = pull.MoistureRisk,
            holdHours = holdHrs,
            isBetween = p.Id == CookProfiles.BalancedId
        };
    });
    return new
    {
        profiles,
        betweenNote = "“In between” uses the midpoint between the juicy pull (90.5 °C) and hotter pull (95 °C), same hold box temp, and average shrink.",
        axis = new
        {
            juicyPullC = CookProfiles.Juicy.PullTempC,
            traditionalPullC = CookProfiles.Traditional.PullTempC,
            balancedPullC = CookProfiles.Balanced.PullTempC,
            holdC = CookProfiles.Juicy.HoldTempC
        }
    };
});

app.MapGet("/api/guide", () => new { sections = BrisketGuide.Sections });

app.MapGet("/api/recipes", () => new { recipes = BrisketRecipes.All });

app.MapGet("/api/rest/environments", () => RestEnvironments.All);

app.MapPost("/api/rest", (RestRequest req) =>
{
    var env = RestEnvironments.All.FirstOrDefault(e => e.Id == req.EnvironmentId) ?? RestEnvironments.All[0];
    var ambient = req.EnvironmentId == "custom" && req.AmbientTempC is { } a ? a : env.AmbientC;
    var tau = req.TauHours ?? env.TauHours;
    var projection = restEngine.Predict(req.StartTempC, ambient, req.DurationHours, tau, req.StartRenderedPercent);
    return new
    {
        projection,
        endTempF = CToF(projection.EndTempC),
        summary = BuildRestSummary(projection)
    };
});

app.Run();

static double CToF(double c) => c * 9 / 5 + 32;

static string BuildRestSummary(RestProjection p)
{
    var delta = p.EndTempC - p.StartTempC;
    var dir = delta > 0.5 ? "rose" : delta < -0.5 ? "fell" : "held steady";
    var rend = p.EndRenderedPercent - p.StartRenderedPercent;
    return $"In {p.DurationHours:0.#} hr internal temp {dir} to {p.EndTempC:0.0} °C; collagen +{rend:0.#}% (now ~{p.EndRenderedPercent:0}%).";
}

record RestRequest(
    double StartTempC,
    double DurationHours,
    string? EnvironmentId,
    double? AmbientTempC,
    double? TauHours,
    double? StartRenderedPercent);

record HoldRequest(double PullTempC, double HoldTempC, double? TargetPercent);
record YieldRequest(double WeightKg, string? Grade, double? LossPercent);
