export type FlowMode='teste'|'real';
export type Local={id:string;unit_id:string;nome:string;tipo:string;parent_id:string|null;modo:FlowMode};
export type CatalogItem={id:string;descricao:string;unidade_medida:string|null;subgrupo?:string|null};
export type Lot={id:string;local_id:string;item_id:string;lote:string;validade:string|null;quantidade:number;reservado:number;bloqueado:boolean;contado_em:string;versao:number;item:{descricao:string;unidade_medida:string|null}};
export type Order={id:string;modo:FlowMode;tipo:'transferencia'|'producao';origem_id:string;destino_id:string;status:string;prevista_em:string;motivo:string;versao:number;criado_em:string};
export type Line={id:string;ordem_id:string;item_id:string;papel:'insumo'|'produto';quantidade:number;recebido:number;item:{descricao:string;unidade_medida:string|null}};
export type Reservation={ordem_id:string;lote_id:string;quantidade:number;lote:{lote:string;validade:string|null;item_id:string}};
export type FlowData={modo:FlowMode;units:{id:string;name:string}[];locais:Local[];lotes:Lot[];ordens:Order[];itens:Line[];reservas:Reservation[];eventos:{id:string;acao:string;entrada:Record<string,unknown>;resultado:Record<string,unknown>;criado_em:string;ator:string}[];limitado:boolean};
