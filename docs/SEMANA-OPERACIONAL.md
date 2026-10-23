# Lista operacional semanal

Extensão do planejamento do PR #25 em `/compras`, acima do histórico ao vivo. Não cria pedidos nem envia mensagens. As fontes Lorean/Everest permanecem somente leitura.

## Leituras e revisão

- Sexta a domingo: próxima semana. Segunda a quinta: semana corrente.
- `compras_semana_capturar(date,uuid[])` preserva a primeira leitura de cada dia por casa. Repetir é idempotente; não altera a sexta ao capturar a segunda. Datas vêm do banco em São Paulo; não aceita retroagir ou antecipar uma captura.
- A tela mostra quando a leitura de segunda ainda não existe. A rotina externa de sexta/segunda pode chamar a mesma função, após resolver escopo e semana; o botão autenticado também permite registrar uma leitura.
- Captura inclui o retorno da RPC existente e os pedidos não recebidos/não cancelados. Estes pedidos são evidência para conciliação, nunca recebimento presumido. Não há associação automática por nome nem desconto por status `enviado`.
- O histórico de conferências é acrescentado, não sobrescrito. Uma conferência está ligada à leitura e ao insumo/casa; não migra para segunda. Quantidades são sempre propostas informadas, não dados comprovados ou autorização.

## Cálculo e cobertura

As três médias ficam lado a lado. O padrão existente de 8 semanas é preservado. Quando indisponível, é exibida explicitamente a alternativa 4, depois 12 semanas. Sem janela válida, não há referência. São médias brutas da parte mapeada; dias ausentes, 86 e fichas faltantes não são corrigidos por imputação.

P0 = histórico de 86 em produto associado; P1 = nenhuma referência válida, unidade ausente ou ingrediente usado por pelo menos cinco produtos; P2 = demais. Prioridade é de conferência, não declaração de ruptura atual ou lista aprovada de itens inegociáveis.

Cada proposta exige demanda bruta revisada (rendimento, perdas e usos não mapeados), estoque utilizável na abertura de segunda, entregas confirmadas antes dessa abertura e ainda fora do estoque, segurança, conteúdo por embalagem e justificativa para cada termo. Campos vazios não viram zero. A sexta exige projeção do consumo e movimentos do fim de semana; entregas durante a semana exigem plano diário externo e não são descontadas neste cálculo conservador.

`embalagens = ceil(max(0, demanda + segurança - estoque_abertura - entregas_fora_do_estoque) / conteúdo_embalagem)`

`quantidade_proposta = embalagens × conteúdo_embalagem`

Consolidado agrupa somente o mesmo ID Everest e unidade. Unidade desconhecida permanece separada por casa. Uma casa sem conferência bloqueia o total daquele grupo; soma parcial não é apresentada como necessidade completa. Produtos sem ficha ficam numa fila explícita, com vendas 4/8/12 e sem quantidade de ingrediente inventada.

Os parâmetros de reposição de `compras_estoque_minimo` são consultados ao abrir a lista e identificados como cadastro **atual**, separado da leitura preservada. Itens cadastrados para transferência não permitem proposta de compra direta, inclusive no servidor. Mínimo cadastrado não é presumido como segurança. Transferências exigem origem e disponibilidade verificadas e não são deduzidas automaticamente.

## Acesso

Tabelas com RLS, sem grants a PUBLIC/anon/authenticated. Apenas SELECT/INSERT ao serviço. RPC SECURITY INVOKER, executável somente pelo serviço. Actions autenticam e derivam casas de `comprasAccess`; a conferência valida snapshot, item e casa no servidor. Nenhuma credencial ou exportação de negócio é publicada no repositório.

## Validação

Testes cobrem calendário, estoque antigo, janelas inválidas, ausência versus zero, arredondamento, separação por unidade, consolidado incompleto e não reutilização de conferência antiga. A homologação visual autenticada é uma etapa separada: compilação e consulta do banco não comprovam uso da tela autenticada.
