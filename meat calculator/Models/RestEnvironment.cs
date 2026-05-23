namespace meat_calculator.Models;

public sealed record RestEnvironment(
    string Id,
    string Name,
    double AmbientC,
    double AmbientF,
    double TauHours,
    string Description);

public static class RestEnvironments
{
    /// <summary>Time constant τ — hours to move ~63% toward ambient (wrapped brisket estimate).</summary>
    public static readonly RestEnvironment[] All =
    [
        new("hold150", "Warm holder / cambro", 65.5, 150, 2.0,
            "Set to ~65.5 °C (150 °F). Wrapped brisket slowly cools into the hold."),
        new("counter", "Kitchen counter", 21, 70, 2.5,
            "Loose foil or uncovered — cools toward room temp. Good for short rest if pulled hot."),
        new("fridge", "Fridge", 4, 39, 1.2,
            "Chills fast — collagen rendering nearly stops. Slice later."),
        new("custom", "Custom ambient", 65.5, 150, 2.0,
            "Set your own target temp (oven on low, cool box, etc.).")
    ];
}
