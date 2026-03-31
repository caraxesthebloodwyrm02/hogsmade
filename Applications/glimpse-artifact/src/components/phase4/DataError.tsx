import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface DataErrorProps {
    message: string;
    onRetry?: () => void;
    className?: string;
    compact?: boolean;
}

/**
 * Inline error state for data-loading sections.
 * Shows error message + optional retry button.
 */
export function DataError({ message, onRetry, className, compact }: DataErrorProps) {
    if (compact) {
        return (
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium",
                    className,
                )}
                role="alert"
            >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{message}</span>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="ml-auto shrink-0 p-1 rounded hover:bg-rose-100 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400"
                        aria-label="Retry"
                    >
                        <RefreshCw className="w-3 h-3" />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center p-6 rounded-xl border border-rose-200 bg-rose-50/50",
                className,
            )}
            role="alert"
        >
            <AlertTriangle className="w-8 h-8 text-rose-500 mb-3" />
            <p className="font-body text-sm text-rose-700 font-medium text-center mb-1">
                Something went wrong
            </p>
            <p className="font-body text-xs text-rose-500/80 text-center max-w-xs mb-3">
                {message}
            </p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                    <RefreshCw className="w-3 h-3" />
                    Try again
                </button>
            )}
        </div>
    );
}
