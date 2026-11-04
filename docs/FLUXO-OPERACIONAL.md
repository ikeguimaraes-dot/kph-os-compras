# Compras e logística: execução por etapas

## Objetivo e fronteiras

Completar o fluxo rastreável de integração, posição de estoque, planejamento, aprovação, recebimento, produção, transferências e gestão por exceções. Verificações técnicas acompanham a implementação; homologação física e comercial é uma etapa distinta. Não declarar autonomia operacional apenas pelo build.

Fontes Everest/Lorean continuam sendo leitura. Saldos locais registrados pela operação precisam ser conciliados com o ERP; não somar os dois saldos nem duplicar baixas. Pedidos e pagamentos reais não são disparados durante a preparação. Nenhuma condição comercial, contagem física ou aprovação humana pode ser inventada.

## Entregas e critérios

1. Integrações: coleta frequente e painel por casa com horários, cobertura e erros reais. Cadastro ambíguo bloqueia execução automática.
2. Posição: locais, lotes, validade, bloqueio de qualidade, contagens, reservas e histórico. Zero e desconhecido distintos. Conciliar fisicamente antes de autonomia.
3. Planejamento: demanda diária, estoque utilizável, entregas confirmadas, segurança, embalagem e prazo. Mostrar bloqueios e memória de cálculo.
4. Compras: solicitação, aprovação, fornecedor, preço e prazo; idempotência e trilha de decisão. Emissão externa depende de integração homologada e autorização explícita.
5. Recebimento: quantidades efetivamente aceitas, parciais, recusas, lotes e validade; conciliação com pedido e nota. Não marcar recebido por presunção.
6. Logística e produção: reservas, expedição, trânsito e confirmação no destino. Produção depende de composição e rendimento homologados.
7. Autonomia: política por item/casa, limites e bloqueios. Começar por simulação; habilitação operacional depende de homologação, preços vigentes, conectores e reconciliação.
8. Exceções: prioridades, responsáveis e histórico; avaliar acurácia, rupturas, perdas, pedidos repetidos e entregas no prazo.

## Registro de implementação

- Coleta de movimentos: Financeiro PR #30, publicada; observar execuções por casa e retentativas.
- Checkout de Compras alinhado à árvore de main `f665190f48e4168a25bce117744e95d701a19878` antes de editar.
- Reutilizar cálculo existente do PR #32 sem incorporar visualizações ou exportações alheias ao escopo.
- Fluxo implementado: `/compras/operacao`, `/compras/automacao`, `/compras/logistica` e `/compras/recebimento`.
- Testes técnicos em banco PostgreSQL embarcado cobrem autorização, isolamento teste/real, reservas FEFO, consumo, conservação de quantidade, recebimento parcial, repetição, saldo insuficiente, aprovação vinculada ao conteúdo, limite e versão de política.
- A interface autenticada e a operação física ainda exigem homologação. Compilação não substitui essa etapa.

## Regras de execução

- Logística abre em modo de teste; registros têm ambiente obrigatório e os vínculos cruzados entre teste e real são recusados no banco. Não inserir mercadorias fictícias no ambiente real.
- As novas tabelas só são acessadas pelo servidor. Cada escrita autoriza o ator autenticado e as casas envolvidas; não confiar em `unit_id` ou `ator` enviados pelo navegador.
- Clientes autenticados não podem mais atualizar diretamente os pedidos ou suas quantidades recebidas. A criação existente usa a RPC de serviço. Sessões antigas recebem orientação para usar o fluxo de conferência.
- Aprovação registra fornecedor, prazo, linhas, quantidades e preços. Qualquer alteração nesses campos invalida a aprovação. Registro de envio exige essa assinatura e documenta uma ação já realizada externamente; não envia mensagem.
- O identificador da nota/comprovante é único por pedido. Cada entrega física deve ter identificação própria, e todas as suas linhas devem ser conferidas juntas. Repetir a mesma chave retorna o resultado anterior; reutilizá-la com outro conteúdo falha.
- Destinação de recebimento exige item canônico, fator explícito e local real da mesma casa. Cada linha aceita só pode ser destinada uma vez. Contagem posterior do mesmo lote bloqueia adição retrospectiva para evitar duplicidade. Lotes com apresentações separadas continuam no fluxo próprio, sem usar saldo agregado.
- Recalcular planejamento lê as fontes atuais da casa e grava apenas uma consolidação derivada. Limite de cinco minutos entre recomposições da mesma casa; nenhum agendamento é alterado. Demanda exige quatro amostras por dia da semana. Entrega tardia não cobre déficit anterior.
- Políticas permitem somente bloqueio ou simulação. Os limites de valor e quantidade são por proposta. Não há emissão autônoma, compromisso financeiro, orçamento diário automático ou conector de fornecedor homologado nesta entrega.
- As exceções continuam visíveis enquanto a condição existir na fonte, mesmo após registrar evidência de solução. Não há notificação externa.

## Dependências para autonomia real

1. Homologar locais, apresentações, conversões, fichas e rendimento com a operação.
2. Conciliar saldo físico, consumo, perdas e entradas com o Everest sem duplicar movimentos. O controle local não substitui automaticamente o ERP.
3. Confirmar pedidos abertos e preços comerciais vigentes. Histórico de nota não é cotação.
4. Homologar emissão e retorno de pedidos com fornecedores, orçamento por período e regras de exceção; só então habilitar execução autônoma em uma mudança específica.
5. Confirmar qualidade dos dados por vários ciclos operacionais. Uma manhã de teste não comprova padrão de chegada das baixas.

## Validação e implantação

`node --test tests/fluxo-operacional.test.mjs`

`node --import tsx --test tests/planejamento-operacional.test.ts tests/stock-presentations.test.ts tests/unit-scope.test.ts tests/pedidos.test.ts tests/planejamento.test.ts`

`npm run type-check` e `npm run build -- --webpack`; lint dos arquivos alterados.

Aplicar as três migrations `compras_fluxo_operacional`, `compras_recebimento_transacional` e `compras_operacao_governanca`, nesta ordem, antes de publicar a interface. Verificar RLS, grants e assinatura das RPCs no ambiente. Nunca reverter por exclusão de tabelas depois de registrar operação real; preservar o histórico e bloquear novas escritas enquanto se corrige.

## Roteiro proposto para homologação operacional

Janela sugerida: 10h–11h, America/Sao_Paulo. Se o início ocorrer às 11h, deslocar os blocos mantendo a sequência.

| Bloco | Conferência | Critério |
|---|---|---|
| 10h–10h10 | Login, permissão e fontes nas quatro casas | Cada perfil vê apenas casas autorizadas; atrasos aparecem como pendência |
| 10h10–10h25 | Logística em modo de teste: contar, reservar, expedir e receber parcialmente | Quantidades conservadas; repetição não duplica; lote e validade preservados |
| 10h25–10h35 | Produção em modo de teste, com rendimento menor | Consumo único; saída real do exercício; diferença documentada |
| 10h35–10h50 | Revisar um pedido real e, se houver entrega física, conferir seu recebimento | Aprovação vinculada ao conteúdo; aceita/recusada corretas; sem lançamento fictício |
| 10h50–11h | Simulação, limites, exceções e responsáveis | Cadastro pendente bloqueia sugestão; nenhum envio ou pagamento automático |

Se não houver entrega física, validar recebimento transacional pela evidência dos testes técnicos e deixar a homologação real pendente. Não criar recebimentos reais para completar o roteiro.
