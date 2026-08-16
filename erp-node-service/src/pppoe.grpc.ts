import { Injectable } from '@nestjs/common';

/**
 * Thin ERP-side adapter for PPPoE operations. The actual router operations
 * remain implemented by mikrotik-go-service; this service only keeps the
 * internal gRPC migration isolated from the REST controllers.
 */
@Injectable()
export class PppoeGrpcAdapter {}
