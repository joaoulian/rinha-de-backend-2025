export class Cents {
  readonly value: number;

  private constructor(value: number) {
    this.value = value;
  }

  public static fromUnits(value: number): Cents {
    return new Cents(value * 100);
  }

  public toUnits(): number {
    return this.value / 100;
  }
}
