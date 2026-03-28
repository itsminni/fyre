interface ChatAvatarProps {
  name: string;
  size?: number;
  isOnline?: boolean;
}

const gradients = [
  ['#ff9f66', '#ff5f4d'],
  ['#74b9ff', '#3867d6'],
  ['#6ee7b7', '#16a34a'],
  ['#f9a8d4', '#ec4899'],
  ['#fdba74', '#f97316']
];

function gradientForName(name: string): string {
  const code = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const [start, end] = gradients[code % gradients.length];
  return `linear-gradient(135deg, ${start}, ${end})`;
}

export function ChatAvatar({ name, size = 52, isOnline = false }: ChatAvatarProps): JSX.Element {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((piece) => piece[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span className="chat-avatar" style={{ width: size, height: size, background: gradientForName(name) }}>
      <span>{initials || 'FY'}</span>
      {isOnline && <span className="chat-avatar__presence" aria-label="online" />}
    </span>
  );
}
