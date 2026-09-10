"use client";
import { useEffect, useRef } from "react";
import { Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, label } from "@/lib/utils";
export function Badge({
  value,
  children,
}: {
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "badge",
        `badge-${value.toLowerCase().replaceAll(" ", "-")}`,
      )}
    >
      {children || label(value)}
    </span>
  );
}
export function Score({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "score",
        value >= 75 ? "score-high" : value >= 50 ? "score-mid" : "",
      )}
    >
      {value}
      <span>/100</span>
    </span>
  );
}
export function CompanyName({
  name,
  detail,
  onClick,
}: {
  name: string;
  detail?: string | null;
  onClick?: () => void;
}) {
  return (
    <div className="company-cell">
      <span className="company-avatar">
        {name.substring(0, 2).toUpperCase()}
      </span>
      <div>
        {onClick ? (
          <button className="text-link company-title" onClick={onClick}>
            {name}
          </button>
        ) : (
          <strong className="company-title">{name}</strong>
        )}
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={27} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={cn("modal", wide && "modal-wide")}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Fermer la fenêtre"
        >
          <X size={20} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function SafeLink({
  href,
  children,
}: {
  href: string | null | undefined;
  children?: React.ReactNode;
}) {
  if (!href || !/^https?:\/\//i.test(href))
    return <span className="muted">{children || "Aucune source"}</span>;
  return (
    <a
      className="text-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children || href}
    </a>
  );
}
