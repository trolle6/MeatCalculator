namespace meat_calculator.Models;

public sealed record RecipeStep(int Order, string Text);

public sealed record RecipeCard(
    string Id,
    string Title,
    string Subtitle,
    string Level,
    string Meat,
    IReadOnlyList<RecipeStep> Steps,
    string? FinishNote = null,
    string? CalculatorHint = null);

public static class BrisketRecipes
{
    public static IReadOnlyList<RecipeCard> All =>
    [
        new(
            "foil-boat",
            "No-fail foil boat",
            "Most forgiving · reliable for beginners",
            "Beginner",
            "Brisket",
            [
                new(1, "Smoke at 121–135 °C (250–275 °F) until bark is dry and firm (usually 4–5 hr)."),
                new(2, "Place in an open aluminium foil boat — bottom braises in collected juices."),
                new(3, "Bump pit to 149 °C (300 °F); convective heat renders the fat cap on top."),
                new(4, "Finish ~95–96 °C (203–205 °F) internal average on the flat."),
                new(5, "Au jus: boat drippings + one stick melted butter on slices.")
            ],
            "Forgiving of temperature spikes.",
            "Dashboard @ 95 °C · Rest tab after pull."),

        new(
            "long-hold",
            "Undercook & long hold",
            "Advanced juiciness",
            "Advanced",
            "Brisket",
            [
                new(1, "Pull at 90.5 °C (195 °F) — ~40% rendered; flat should feel tight, not butter-tender."),
                new(2, "Wrap and go straight into a 65.5 °C (150 °F) holding oven ~18 hours."),
                new(3, "~4 hr temperature decline from 90.5 → 65.5 °C finishes much of the remaining ~60% render."),
                new(4, "Gentle hold to ~100% without muscle fibres denaturing past 93.3 °C on the pit.")
            ],
            "Texas-style “secret” for max juice.",
            "Pull & Hold · gauge “After hold finishes”."),

        new(
            "confit",
            "Brisket confit",
            "Tallow · prime-rib texture",
            "Specialty",
            "Brisket",
            [
                new(1, "Smoke to 74 °C (165 °F) — about 4–6 hours."),
                new(2, "Submerge in beef tallow at 68.3 °C (155 °F) (sous-vide)."),
                new(3, "18 hours in tallow."),
                new(4, "Slice — eats like prime rib more than classic brisket.")
            ],
            null),

        new(
            "reverse-smoked",
            "Reverse smoked brisket",
            "Paper-first · chill · reheat",
            "Specialty",
            "Brisket",
            [
                new(1, "Wrap in butcher paper before the brisket hits the smoker."),
                new(2, "Smoke until 88 °C (190 °F) internal."),
                new(3, "Refrigerate overnight."),
                new(4, "Next day: smoker at 121 °C (250 °F) until internal reaches ~65.5 °C (150 °F)."),
                new(5, "Less total smoke than traditional — very juicy.")
            ],
            "Two-day plan; milder bark.")
    ];
}
