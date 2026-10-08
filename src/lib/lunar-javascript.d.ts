declare module "lunar-javascript" {
  export interface EightChar {
    setSect(sect: number): void;
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
  }
  export interface Lunar {
    getEightChar(): EightChar;
  }
  export const Solar: {
    fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): { getLunar(): Lunar };
  };
}
