import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Get correlation ID from header or generate new one
    let correlationId = request.headers['x-correlation-id'] || request.headers['x-corr-id'];
    
    if (!correlationId) {
      correlationId = uuidv4();
    }
    
    // Set correlation ID in response headers
    response.setHeader('x-correlation-id', correlationId);
    
    // Add to request object for use in services
    request.correlationId = correlationId;
    
    return next.handle();
  }
}
