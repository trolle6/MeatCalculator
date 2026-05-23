namespace meat_calculator.Models;

public sealed record SourceItem(
    string Id,
    string Title,
    string Summary,
    string? Url,
    bool IsPrimary = false);

public static class BrisketSources
{
    public const string ChannelUrl = "https://www.youtube.com/@SteveGowSmokeTrailsBBQ";
    public const string ChannelTitle = "Steve Gow (Smoke Trails BBQ) — YouTube";
    public const string Intro =
        "Smoke Lab is a community planning tool. Ideas below come from public brisket teaching (mainly Steve Gow / Smoke Trails BBQ). Not affiliated with or endorsed by the channel.";

    public static readonly SourceItem[] Items =
    [
        new(
            "dry-brisket",
            "203°F Is DRYING OUT Your Brisket",
            "Moisture loss, beef grades, and why pulling around 90.5 °C (195 °F) can stay juicier than riding to 203 °F on smoke alone.",
            null),
        new(
            "internal-temp",
            "Brisket INTERNAL TEMP & Finishing Guide",
            "Landmark probing around 82 °C (180 °F) and how collagen breakdown depends on both time and temperature.",
            null),
        new(
            "smoker-mods",
            "Do Smoker Mods Make a Difference? | Smoke Lab with Steve Gow",
            "Fire baskets, scoops, stack extensions, and thermodynamics on offset cookers.",
            null),
        new(
            "smoke-140",
            "Does Brisket STOP Absorbing Smoke at 140°F?",
            "Smoke flavour and smoke ring can keep developing well past 60 °C (140 °F) on a wet bark.",
            null),
        new(
            "reverse-wrap",
            "REVERSE SMOKED Brisket | The brisket wrap experiment",
            "Wrap-first, smoke-later — lighter smoke profile, strong moisture retention.",
            null),
        new(
            "channel",
            "Steve Gow (Smoke Trails BBQ) — YouTube",
            "Channel overview: pellet and electric rigs, brisket methods, and related cooks.",
            ChannelUrl),
        new(
            "fire-basket",
            "The BEST offset fire management method for temperature control",
            "Fire basket vs V-grate — steadier temps with less babysitting in the model comparison.",
            null),
        new(
            "foil-boat",
            "The Easy Beginner Brisket Method That Works Every Time",
            "Foil boat: top-down heat on the fat cap, bottom braises in juices.",
            null),
        new(
            "confit",
            "The JUICIEST BRISKET you'll ever eat: Brisket Confit",
            "Smoke to ~74 °C, then ~18 hr in beef tallow at ~68.3 °C for a prime-rib-like texture.",
            null),
        new(
            "render-model",
            "The Science of Brisket Tenderness (And Perfect Hold Time)",
            "Primary reference for the exponential rendering model and temperature multipliers used in Smoke Lab.",
            null,
            IsPrimary: true)
    ];
}
