interface EventMetricTileProps {
  title: string;
  value: string;
  caption?: string;
}

export function EventMetricTile({ title, value, caption }: EventMetricTileProps): JSX.Element {
  return (
    <article className="event-metric-tile">
      <p className="event-metric-tile__title">{title}</p>
      <p className="event-metric-tile__value">{value}</p>
      {caption && <p className="event-metric-tile__caption">{caption}</p>}
    </article>
  );
}
