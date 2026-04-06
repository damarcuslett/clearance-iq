interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function PageHeader({ title, subtitle, right }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-[var(--muted)] mt-1">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}
