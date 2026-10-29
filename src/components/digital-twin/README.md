# Atlas — V3

Experiência 3D exploratória em `/compras/atlas`, com laboratório local em `/lab/operacao`, criada com Three.js. A V4 abre leituras operacionais rastreáveis; não emite pedidos nem altera as fontes.

## Executar

```sh
npm install
npm run dev -- --hostname 127.0.0.1
```

Abra `http://127.0.0.1:3004/lab/operacao`.

A rota existe apenas em `NODE_ENV=development` e para host local. Em produção ou host diferente, retorna 404. O servidor deve escutar apenas na interface de loopback. Não foi criado bypass de autenticação nas rotas existentes.

## Dados

O arquivo privado `.local/twin-snapshot.json` é lido no servidor. Está ignorado pelo Git, fora de `public/`, e não contém credenciais. Seu formato está em `model.ts` (`TwinData`). Se não existir, a página apresenta a ausência do snapshot; não substitui números por dados inventados.

A leitura desta V1 foi extraída de `compras_automacao_execucao` e `compras_automacao_referencia_comercial`, somente por SELECT. Os totais por casa abrangem o cálculo completo; a exploração mostra 16 insumos por casa. A seleção da amostra não é ranking financeiro: grandezas de unidades diferentes não são comparáveis.

O cenário espacial, a localização ilustrativa por categoria, os móveis, pessoas, caminhões e percursos são conceituais. Não representam plantas, endereços de depósito, entregas ou telemetria real. A UI informa essa distinção. Os seis ambientes são conceituais e não representam seis depósitos cadastrados.

## Interações

- Grupo → casa → ambiente → insumo, por botões ou seleção na maquete.
- Arrastar para orbitar; roda do mouse e botões para zoom; reposicionar câmera.
- Camadas operação/estoque/fluxo, iluminação dia/noite, pausa de movimento e vista ampliada.
- Busca na amostra, médias por dia da semana e referências documentais do insumo.
- Horizonte de 0–7 dias, calculado na data local de São Paulo. Dias sem dado ou com menos de quatro amostras não geram previsão. A cobertura exige saldo não negativo, tecnicamente válido e recente na data da captura. A projeção não inclui novas entradas.
- Modal de ajuda com Escape e contenção de foco; botões HTML como alternativa à interação no canvas; redução de movimento respeitada.

## Verificação

TypeScript, ESLint, testes de projeção e validade do saldo. Conferência em Chrome local: navegação entre casas, seleção de insumo, notas, projeção disponível/insuficiente, camadas e iluminação. Nenhum deploy ou escrita no banco faz parte desta entrega.

## V2 — fornecedores, fábrica e participação das casas

O snapshot complementar `.local/atlas-network.json` (`TwinNetwork`) vem de SELECTs em `lorean_workdays`, `lorean_produtos_dia`, `compras_automacao_referencia_nota` e `everest_fornecedores`. Consultas de origem ficam no arquivo privado `.local/atlas-provenance.json`. Todos os arquivos `.local/` continuam fora do Git.

- Comparação das casas: mesmos dias para todas, excluindo dias suspeitos, sobreposição de dia inteiro/turnos, duplicação de turno e qualquer turno sem produtos. São dias observados não consecutivos dentro da janela informada, não a receita integral dessa janela.
- Receita é `receita_bruta` do Lorean; quantidade é soma de `lorean_produtos_dia.qtd`. Não é contagem de clientes, comandas ou faturamento contábil.
- As duas dimensões horizontais dos prédios usam a raiz quadrada da razão para a maior casa. Portanto a área do prédio, e não a dimensão linear, é proporcional à métrica escolhida. Altura e terrenos são ilustrativos. A escala igual não muda os números reais.
- Fornecedores: WEW e Guidara, mais os dois maiores KG entre os demais nas referências consultadas. Não representa uma lista completa nem um ranking misturando unidades. Agrupamento por raiz do CNPJ; KG, L e UNID continuam separados.
- “Relações nas notas” anima somente pares fornecedor–casa existentes nas notas, sem inferir rota física ou passagem pela fábrica.
- “Via fábrica · cenário” mostra recebimento, reserva, produção e expedição. Ainda não há vínculo de unidade ERP, ordens ou transferências da fábrica neste Atlas. Não são calculados saldos, capacidade, receita ou prazo para ela.
- Galpões, lavoura, esteira, veículos identificados e frequência dos deslocamentos são representação visual. O motivo agrícola do fornecedor de hortifruti não comprova propriedade de fazenda. Não há GPS, status de entrega ou telemetria.
- Clique em fornecedor/fábrica aproxima a câmera e filtra fluxos. Botões de velocidade, pausa, iluminação e retorno continuam disponíveis. A preferência de movimento reduzido impede o avanço das animações.

Verificação V2: testes de participação e conservação da proporção de área, TypeScript, ESLint e inspeção visual em Chrome. Sem deploy, migrations ou escrita no banco.

## V3 — vida nas casas e na cadeia

- Clientes sentados, pratos e copos, gestos de refeição, garçom com bandeja circulando, cozinheiros preparando alimentos, vapor nas panelas e bartender em atividade.
- Pessoas e carrinhos nas docas; equipe de produção na fábrica; volumes ilustrativos aparecem na carga/descarga dos caminhões. Pausa, velocidade e preferência de movimento reduzido controlam essas animações.
- Entrada pelo salão do Meet; navegação rápida entre casas e grupo, aproximação de ambientes e rótulos opcionais. Paletas, letreiros e decoração diferenciam as casas, sem afirmar fidelidade arquitetônica.
- Seletor de dia da semana usa o snapshot privado `.local/atlas-activity.json` (`TwinActivity`), com consulta SELECT de origem preservada nesse arquivo. A consulta não é enviada ao cliente.
- Fonte: `lorean_workdays.clientes`, agregada por casa e dia antes da média por dia da semana, na janela exibida. Exclui dias suspeitos, sobreposição de dia inteiro/turnos, turnos duplicados e registros sem clientes válidos. Um dia registrado pode conter apenas os turnos disponíveis; não equivale automaticamente a um dia completo. Dias ausentes não viram zero nem determinam fechamento.
- Média exibida apenas com quatro ou mais dias observados. O movimento usa a razão para a maior média confiável da própria casa. Entre 4 e 16 personagens simbólicos representam intensidade; zero observado exibe zero clientes e falta de amostra mantém oito personagens ilustrativos, com aviso explícito. Não representa lotação, presença em tempo real ou escala de funcionários.
- Os snapshots são locais e não se atualizam automaticamente. A V3 não modifica bases, pedidos, alertas 85/86 ou qualquer estado operacional.

Verificação V3: oito testes de modelo (incluindo amostras insuficientes, zeros e normalização por casa), TypeScript, ESLint e conferência visual no Chrome local. Sem deploy ou escrita no banco.

## Publicação da V3

A rota `/compras/atlas` usa o layout autenticado de Compras e verifica novamente sessão e autorização por casa com `comprasAccess`. O item **Atlas** aparece em **Visão & direção**, no menu desktop e móvel. Não usa `basePath`.

A captura aprovada é armazenada em `ATLAS_SNAPSHOT_GZIP`, variável privada de produção na Vercel (gzip/base64). Não é `NEXT_PUBLIC`, não é arquivo público e não é commitada. Não há atualização automática: a data da captura permanece explícita. O servidor decodifica e filtra as casas, vendas, atividade e fornecedores antes de enviar o resultado ao navegador. Em acesso parcial, recalcula totais documentados por casa e omite totais de unidades de medida disponíveis apenas para o grupo.

Para preparar uma nova captura aprovada, mantendo os arquivos privados em `.local/`:

```sh
node scripts/atlas-package-snapshot.mjs .local/atlas-production.b64
```

Configure o conteúdo desse arquivo como segredo `ATLAS_SNAPSHOT_GZIP` no projeto correto e faça novo deploy. Ausência de configuração mostra indisponibilidade, nunca dados fictícios. O laboratório continua bloqueado em produção. Não há migrations nem gravações no banco.

Validação de publicação: onze testes de modelo/escopo, TypeScript, ESLint e build de produção. Os testes de escopo incluem acesso vazio, acesso a uma casa e acesso integral.


## V4 — compras, pedidos, produção e reposição

A página autenticada lê `src/lib/atlas/load.ts` com service role somente depois de `comprasAccess`. Cada consulta por casa usa os IDs autorizados, limitados às casas do Atlas. Não há API pública nova, migration ou mutação das fontes. `?ano=` aceita o ano atual e os dois anteriores; estoque e pedidos continuam sendo a posição atual, explicitamente datados.

- **Compras:** cabeçalhos canônicos de `everest_notas_recebidas_atuais` + linhas elegíveis de `everest_notas_recebidas_itens`. A deduplicação de versão vem da view; totais em centavos deduplicam também a identidade da linha. Período por lançamento, sem anualização. É compra, não CMV consumido ou pagamento. Fornecedores agrupados por raiz de CNPJ válida em formato; sem identificação, preserva a identidade do cadastro. Não faz match por nome.
- **Pedidos:** `purchase_orders`, `purchase_order_items`, `suppliers`, `compras_automacao_pedido_item`. Até 24 caminhões e todos os pedidos em cartões. Percurso exige fornecedor identificado, casa e previsão. Posição indica etapa simbólica; sem GPS. Sem esses dados, o caminhão fica estacionado. Notas recebidas não são convertidas em pedidos futuros.
- **Produção:** `everest_estoque_depositos`/`everest_estoque_saldos`, escopo empresa + depósito + casa. Saldo válido exige coleta completa, identidade ERP, unidade coerente, quantidade não negativa, unicidade e até oito horas. Preços são referências históricas de notas, não avaliação contábil. Fichas ativas pertencentes à casa via `everest_fichas_tecnicas_custo`, versão mais recente sem empate, componentes diretos e rendimento. Aproveitamento diferente de 100% fica pendente. Potencial de bases na cadeia de proteínas, limitado por TODOS os componentes; subprodutos precisam já estar disponíveis. Capacidades isoladas não podem ser somadas se disputam o mesmo saldo.
- **Reposição:** reutiliza `getAutomation`, com médias por dia da semana, entregas conciliadas e validações existentes. A data de pedir antecede a primeira queda abaixo da reserva mínima pelo prazo de reposição. Falta de dados e ausência de ruptura no horizonte são estados distintos. Produção é identificada separadamente de compra.

Compras, pedidos e saldos são lidos a cada abertura/atualização. Proporção de vendas das casas e atividade ilustrada ainda usam o snapshot histórico V3, com cobertura explicitada. A fábrica continua uma representação: depósito Central não comprova uma fábrica física compartilhada.

O payload operacional é comprimido no servidor após autorização e descomprimido no navegador (DecompressionStream). Isto evita retransmitir nomes repetidos de todo o catálogo em dezenas de milhares de saldos. Arquivos de verificação real ficam somente em `.local/`, nunca no bundle ou Git. O laboratório `?v=4` continua restrito a development + localhost.

Verificação automatizada: `node --import tsx --test tests/atlas-operations.test.ts tests/digital-twin.test.ts tests/atlas-scope.test.ts`. Cobre limitação por componente, componentes repetidos, dados ausentes, centavos/deduplicação, reserva mínima/prazo/entregas, etapa de pedidos e isolamento por casa.


## Pendências operacionais

`/compras/pendencias` reúne os impedimentos detectados nas fontes operacionais, com menu compartilhado desktop/móvel. Usa `comprasAccess`, limita casas a unidades operacionais autorizadas e não depende do snapshot 3D. O Atlas usa o mesmo classificador (`src/lib/pendencias/model.ts`) e abre a fila filtrada por casa, área, causa ou insumo.

A leitura cobre: exceções da conciliação automática; pedidos abertos sem fornecedor, previsão ou código ERP; atraso de entrega; depósitos incompletos/vencidos e saldos inconsistentes; saldos sem identidade ou preço consistente; cadastros das fichas ativas pertencentes às casas; capacidade das bases de proteínas por depósito; identidade nas notas do ano consultado; confirmações e vínculos da posição operacional. Não usa 85/86 por si só como falha nem trata encaminhamento para produção como erro. A capacidade permanece restrita às bases da cadeia de proteínas; não é uma auditoria de toda a empresa.

IDs da fila são derivados de casa + fonte + registro + causa. Exceções repetidas são deduplicadas. Falhas gerais de coleta do depósito aparecem uma vez por depósito; falhas por item mantêm seu escopo. Um item pode ter várias ocorrências. Saldos negativos e unidades divergentes têm causas distintas. As referências de valor vêm de compras do item na casa no ano consultado e não devem ser somadas entre ocorrências; não representam perdas.

Não há tabela nova nem gravação de tarefas: a fila é recalculada e sai da leitura quando a origem comprova correção. Área indicada não é uma atribuição aceita. Falha de fonte aparece como cobertura incompleta, nunca como ausência de pendências. Leituras paginadas fazem uma tentativa adicional somente para resposta HTTP 5xx. Nada deste diagnóstico altera notas, estoque, pedidos ou histórico 85/86.

`tests/operational-pendings.test.ts` cobre identidade por casa, deduplicação, resolução derivada, pedidos abertos, ausência de preço versus saldo zero, falha de fonte, confirmações e fichas fora da cadeia de proteínas. Laboratório privado: `/lab/operacao?v=pendencias`, com o mesmo bloqueio de produção/host do laboratório Atlas; leitura preparada em `.local/pendencias-test.json`.
