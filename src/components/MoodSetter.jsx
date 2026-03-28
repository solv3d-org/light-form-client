export default function MoodSetter({ theme, onThemeChange }) {
  return (
    <div className="mood-setter">
      <span className="mood-setter-label">Set the mood</span>
      <div className="mood-pills" role="group" aria-label="Hero mood themes">
        {["neutral", "warm", "cosy"].map((option) => {
          const label = option === "cosy" ? "Cosy" : option[0].toUpperCase() + option.slice(1);
          const isActive = theme === option;

          return (
            <button
              key={option}
              className={`mood-pill${isActive ? " is-active" : ""}`}
              type="button"
              aria-pressed={String(isActive)}
              onClick={() => onThemeChange(option)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
