# TODO

## Статус: 0.4.0 (dual package)
0.3.0 был подготовлен, но не опубликован — его изменения вошли в состав релиза 0.4.0.

## Открытые задачи

### TypeScript 7 (нативный порт, tsc-go)
`ts-jest` поддерживает `<7`, `typescript-eslint` — `<6.1`. Вернуться к миграции, когда экосистема догонит.

### Обвязка
- Dependabot: проверить, что grouped PR реально приходят (настройка завершена).

### Роадмап фич (из бенчмаркинга аналогов, см. README → Alternatives)
Отложено — возвращаться при запросах пользователей / перед 1.0:
- `abort()` + `AbortSignal` вторым аргументом `batchFetch` — как у batshit;
- per-item retry-токен — как `BATCHER_RETRY_TOKEN` у promise-batcher;
- `prime(id, value | Error)` — fill-if-absent кэш-прайминг как у dataloader;
- `isIdle` / `idlePromise()` — idle-трекинг как у promise-batcher;
- `cacheKeyFn` для объектных ключей (как у dataloader) — переработка дженериков
  `ID extends number | string`;
- богатый scheduler-контракт `(start, latest, batchSize)` как у batshit — нативные
  debounce (`bufferScheduler`) и size-triggered (`windowedFiniteBatchScheduler`,
  `maxBatchSizeScheduler`) планировщики; сейчас наш `batchScheduleFn` вызывается один
  раз на батч и debounce невыразим;
- devtools-пакет (как `@yornaath/batshit-devtools-react`);
- `loadManySettled` / опция «не реджектить loadMany при per-item ошибках»
  (у dataloader loadMany возвращает ошибки значениями).
