"use client";

import { useId, useState } from "react";
import { formatBirthTime, parseBirthTime, type BirthTimeParts } from "@/lib/birth-time";

type BirthTimeInputProps = {
  defaultValue?: string | null;
  disabled?: boolean;
};

export function BirthTimeInput({ defaultValue, disabled = false }: BirthTimeInputProps) {
  const id = useId();
  const [parts, setParts] = useState<BirthTimeParts>(() =>
    parseBirthTime(defaultValue) ?? { period: "am", hour: "", minute: "00" },
  );
  const value = disabled ? "" : formatBirthTime(parts) ?? "";

  return (
    <fieldset className="birth-time-field">
      <legend>출생 시간</legend>
      <div className="birth-time-grid">
        <label htmlFor={`${id}-period`}>
          오전·오후
          <select
            id={`${id}-period`}
            name="birthPeriod"
            aria-label="출생 시간 오전·오후"
            value={parts.period}
            onChange={(event) => {
              const period = event.target.value as BirthTimeParts["period"];
              setParts((current) => ({ ...current, period }));
            }}
            disabled={disabled}
            required={!disabled}
          >
            <option value="am">오전</option>
            <option value="pm">오후</option>
          </select>
        </label>
        <label htmlFor={`${id}-hour`}>
          시
          <select
            id={`${id}-hour`}
            name="birthHour"
            aria-label="출생 시간 시"
            value={parts.hour}
            onChange={(event) => {
              const hour = event.target.value;
              setParts((current) => ({ ...current, hour }));
            }}
            disabled={disabled}
            required={!disabled}
          >
            <option value="">선택</option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => (
              <option key={hour} value={hour}>{hour}시</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-minute`}>
          분
          <select
            id={`${id}-minute`}
            name="birthMinute"
            aria-label="출생 시간 분"
            value={parts.minute}
            onChange={(event) => {
              const minute = event.target.value;
              setParts((current) => ({ ...current, minute }));
            }}
            disabled={disabled}
            required={!disabled}
          >
            {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => (
              <option key={minute} value={minute}>{minute}분</option>
            ))}
          </select>
        </label>
      </div>
      <input type="hidden" name="birthTime" value={value} />
    </fieldset>
  );
}
