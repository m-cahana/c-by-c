import React from "react";

export default function MobileKeyboard({
  dir,
  onChar,
  onBackspace,
  onToggleDir,
}) {
  const row1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
  const row2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
  const row3 = ["Z", "X", "C", "V", "B", "N", "M"];
  const sym1 = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const sym2 = ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'];
  const sym3 = [".", ",", "?", "!", "'", "+", "="];

  const [symbols, setSymbols] = React.useState(false);

  function renderKey(label, handler, extraClass) {
    return (
      <button
        key={label}
        type="button"
        className={extraClass ? `mobile-key ${extraClass}` : "mobile-key"}
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={handler}
        aria-label={label}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className="mobile-keyboard"
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
    >
      {symbols ? (
        <>
          <div className="mobile-keyboard-row">
            {sym1.map((k) => renderKey(k, () => onChar && onChar(k)))}
          </div>
          <div className="mobile-keyboard-row">
            {sym2.map((k) => renderKey(k, () => onChar && onChar(k)))}
          </div>
          <div className="mobile-keyboard-row">
            {renderKey(
              "ABC",
              () => setSymbols(false),
              "mobile-key--action mobile-key--wide"
            )}
            {sym3.map((k) => renderKey(k, () => onChar && onChar(k)))}
            {renderKey(
              "⌫",
              () => onBackspace && onBackspace(),
              "mobile-key--action mobile-key--del"
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mobile-keyboard-row">
            {row1.map((k) => renderKey(k, () => onChar && onChar(k)))}
          </div>
          <div className="mobile-keyboard-row">
            {row2.map((k) => renderKey(k, () => onChar && onChar(k)))}
          </div>
          <div className="mobile-keyboard-row">
            {renderKey(
              "123",
              () => setSymbols(true),
              "mobile-key--action mobile-key--wide"
            )}
            {row3.map((k) => renderKey(k, () => onChar && onChar(k)))}
            {renderKey(
              "⌫",
              () => onBackspace && onBackspace(),
              "mobile-key--action mobile-key--del"
            )}
          </div>
        </>
      )}
    </div>
  );
}
