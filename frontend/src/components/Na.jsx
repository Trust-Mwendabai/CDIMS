/** Marks a value that was never recorded, so it cannot be mistaken for a measured zero. */
export default function Na({ label = 'No data' }) {
  return <span className="na" title="Not recorded: no reading exists for this value">{label}</span>;
}

/** Renders `value + unit`, or the "No data" badge when the value is missing. A genuine 0 is shown as 0. */
export function Val({ value, unit = '' }) {
  return value == null || value === '' || Number.isNaN(value) ? <Na label="n/a" /> : <>{value}{unit}</>;
}
