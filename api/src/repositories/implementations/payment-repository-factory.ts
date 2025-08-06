import type { PaymentRepository } from "../payment-repository";
import {
  PaymentRepositoryRedisImpl,
  PaymentRepositoryRedisImplDeps,
} from "./payment-repository-redis-impl";

export class PaymentRepositoryFactory {
  static createRedisImplementation(
    deps: PaymentRepositoryRedisImplDeps
  ): PaymentRepository {
    return new PaymentRepositoryRedisImpl(deps);
  }

  static create(
    type: "redis",
    deps: PaymentRepositoryRedisImplDeps
  ): PaymentRepository {
    switch (type) {
      case "redis":
        return this.createRedisImplementation(deps);
      default:
        throw new Error(`Unsupported repository type: ${type}`);
    }
  }
}
