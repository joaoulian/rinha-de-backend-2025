export class Cents {
  readonly value: number;

  private constructor(value: number) {
    this.value = value;
  }

  public static fromFloat(value: number): Cents {
    return new Cents(value * 100);
  }

  public static create(valueInCents: number): Cents {
    return new Cents(valueInCents);
  }

  public toFloat(): number {
    return this.value / 100;
  }
}
