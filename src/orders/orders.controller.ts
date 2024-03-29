import { Controller, NotImplementedException } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaginationDto } from 'src/common';
import { ChangeOrderStatus } from './dto';
import { PaidOrderDto } from './dto/paid-order.dto';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern('createOrder')
  async create(@Payload() createOrderDto: CreateOrderDto) {
    const order = await this.ordersService.create(createOrderDto);

    const paymentSession = await this.ordersService.createPaymentSession(order);

    return {
      order,
      paymentSession
    }
  }

  @MessagePattern('findAllOrders')
  findAll(@Payload() paginationDto: PaginationDto) {
    return this.ordersService.findAll(paginationDto);
  }

  @MessagePattern('findOneOrder')
  findOne(@Payload('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @MessagePattern('changeOrderStatus')
  changeOrderStatus(
    @Payload() changeOrderStatus: ChangeOrderStatus
  ) {
    return this.ordersService.changeStatus(changeOrderStatus);
  }

  @EventPattern('payment.succeded')
  payOrder(@Payload() paidOrderDto: PaidOrderDto ) {
    return this.ordersService.paidOrder(paidOrderDto);
  }
}
