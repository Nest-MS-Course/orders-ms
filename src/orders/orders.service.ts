import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PaginationDto } from 'src/common';
import { ChangeOrderStatus } from './dto/change-order-status.dto';
import { catchError, firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from 'src/config';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  constructor(
    @Inject(NATS_SERVICE) private readonly natsClient: ClientProxy,
  ) {
    super();
  }

  private readonly logger = new Logger('OrdersService');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('DB Connected');
  }

  async create(createOrderDto: CreateOrderDto) {

    const { items } = createOrderDto;

    const ids = items.map( item => item.productId )

    const products = await firstValueFrom<any[]>(
      this.natsClient
      .send({ cmd: 'validate_products' }, {ids})
      .pipe(
        catchError(err => { throw new RpcException(err) })
      )
    )

    const totalAmount = createOrderDto.items.reduce( (acc, orderItem) => {
      const price = products.find( product => product.id === orderItem.productId ).price;

      return acc + (price * orderItem.quantity);
    }, 0 );

    const totalItems = createOrderDto.items.reduce( (acc, orderItem) => acc + orderItem.quantity, 0);

    const order = await this.order.create({
      data: {
        totalAmount,
        totalItems,
        OrderItem: {
          createMany: {
            data: createOrderDto.items.map( item => ({
              price: products.find( product => product.id === item.productId ).price,
              productId: item.productId,
              quantity: item.quantity
            }))
          }
        }
      },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          }
        }
      }
    })

    return {
      ...order,
      OrderItem: order.OrderItem.map(orderItem => ({
        ...orderItem,
        name: products.find( product => product.id === orderItem.productId ).name,
      }))
    };
  }

  async findAll(paginationDto: PaginationDto) {

    const { limit, page, status } = paginationDto;

    const totalPages = await this.order.count({
      where: { status },
    });
    const lastPage = Math.ceil(totalPages/limit);

    return {
      data: await this.order.findMany({
        where: { status },
        skip: (page - 1) * limit,
        take: limit
      }),
      meta: {
        page,
        total: totalPages,
        lastPage
      }
    }
  }

  async findOne(id: string) {

    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          }
        }
      }
    })

    if ( !order ) {
      throw new RpcException({
        message: `Order with id ${id} not found`,
        status: HttpStatus.NOT_FOUND
      })
    }

    const productsIds = order.OrderItem.map( orderItem => orderItem.productId );

    const products = await firstValueFrom<any[]>(
      this.natsClient
      .send({ cmd: 'validate_products' }, {ids: productsIds})
      .pipe(
        catchError(err => { throw new RpcException(err) })
      )
    )

    return {
      ...order,
      OrderItem: order.OrderItem.map(orderItem => ({
        ...orderItem,
        name: products.find( product => product.id === orderItem.productId ).name,
      }))
    };
  }

  async changeStatus(changeOrderStatus: ChangeOrderStatus) {
    const { id, status } = changeOrderStatus;
    const order = await this.findOne(id);

    if (order.status === status)
      return order;

    return this.order.update({
      where: { id },
      data: { status }
    })
  }
}
