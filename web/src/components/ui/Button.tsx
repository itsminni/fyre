import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      type={props.type ?? 'button'}
      {...props}
      className={[
        'ui-button',
        `ui-button--${variant}`,
        fullWidth ? 'ui-button--full' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}
