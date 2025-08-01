export type Either<L, A> = Success<L, A> | Failure<L, A>;

export class Success<L, A> {
  readonly value: L;

  constructor(value: L) {
    this.value = value;
  }

  isSuccess(): this is Success<L, A> {
    return true;
  }

  isFailure(): this is Failure<L, A> {
    return false;
  }

  run = () => this.value;
}

export class Failure<L, A> {
  readonly value: A;

  constructor(value: A) {
    this.value = value;
  }

  isSuccess(): this is Success<L, A> {
    return false;
  }

  isFailure(): this is Failure<L, A> {
    return true;
  }

  run = () => {
    throw this.value;
  };

  throw = () => {
    throw this.value;
  };

  getError = (): A => {
    return this.value;
  };
}

export const success = <L, A>(value: L): Either<L, A> => {
  return new Success(value);
};

export const failure = <L, A>(value: A): Either<L, A> => {
  return new Failure<L, A>(value);
};
