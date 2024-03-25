import { OrderStatus } from '@prisma/client';

export const OrderStatusList = [
  OrderStatus.CANCELLED,
  OrderStatus.DELIVERED,
  OrderStatus.PENDING,
]