import { CloseIcon } from "./icons";

interface ClearableInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onClear: () => void;
  clearLabel: string;
  // The wrapper div carries the positioning/flex classes the parent layout
  // needs (e.g. `min-w-0 flex-1` inside a flex row); `className` styles the
  // input itself. Both are optional and merged onto their respective nodes.
  wrapperClassName?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

// A text input with an always-present clear (×) button that appears once
// there is something to clear. Shared by every free-text field so the
// affordance is consistent across the app (search, discover keyword, feed
// URL, genre name) -- previously only the search fields had it.
export function ClearableInput({
  value,
  onClear,
  clearLabel,
  wrapperClassName = "",
  className = "",
  inputRef,
  ...rest
}: ClearableInputProps) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input ref={inputRef} value={value} className={`${className} pr-6`} {...rest} />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center rounded p-0.5 opacity-60 transition-colors duration-150 hover:opacity-100"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
