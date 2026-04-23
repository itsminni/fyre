interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  value: string;
  options: SegmentOption[];
  onChange(value: string): void;
}

export function SegmentedControl({
  value,
  options,
  onChange
}: SegmentedControlProps): JSX.Element {
  return (
    <div
      className="segmented-control"
      role="tablist"
      aria-label="Segmented sections"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
