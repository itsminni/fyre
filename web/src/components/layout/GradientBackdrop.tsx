import { ReactNode } from 'react';

export function GradientBackdrop({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="gradient-backdrop">
      <div className="gradient-backdrop__content">{children}</div>
    </div>
  );
}
