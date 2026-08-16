export interface MediaBlobClient {
  fetchMediaBlob?(ref: string, opts?: { signal?: AbortSignal }): Promise<Blob | null>;
}

type Changed = () => void;
type ObjectUrlFactory = (blob: Blob) => string;
type ObjectUrlRevoker = (url: string) => void;

/**
 * Object URLs de las fotos del catálogo, con un dueño y un ciclo de vida claros.
 *
 * Las referencias portables siguen intactas en los productos. Esta caché sólo conserva la copia
 * efímera que el navegador puede pintar, limita la presión sobre un Hub con 280 fotos y revoca
 * cada URL al sustituir el catálogo o desmontar el TPV.
 */
export class MediaPhotoCache {
  private readonly urls = new Map<string, string>();
  private controller?: AbortController;
  private generation = 0;
  private changeScheduled = false;

  constructor(
    private readonly client: () => MediaBlobClient | undefined,
    private readonly changed: Changed = () => undefined,
    private readonly createObjectUrl: ObjectUrlFactory = (blob) => URL.createObjectURL(blob),
    private readonly revokeObjectUrl: ObjectUrlRevoker = (url) => URL.revokeObjectURL(url),
    private readonly concurrency = 8,
  ) {}

  get(ref: string | undefined): string | undefined {
    return ref ? this.urls.get(ref) : undefined;
  }

  /** Retira sólo la foto que el navegador no pudo decodificar; el resto del muro sigue intacto. */
  drop(ref: string, expectedUrl?: string): void {
    const url = this.urls.get(ref);
    if (!url || (expectedUrl !== undefined && url !== expectedUrl)) return;
    this.urls.delete(ref);
    this.revokeObjectUrl(url);
    this.notifyChanged();
  }

  async replace(refs: Array<string | undefined>): Promise<void> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.revokeAll();

    const unique = [...new Set(refs.filter((ref): ref is string => !!ref?.trim()))];
    const client = this.client();
    const loader = client?.fetchMediaBlob;
    if (typeof loader !== 'function' || unique.length === 0) return;

    let cursor = 0;
    const work = async (): Promise<void> => {
      while (cursor < unique.length) {
        if (generation !== this.generation || controller.signal.aborted) return;
        const ref = unique[cursor++];
        let blob: Blob | null;
        try {
          blob = await loader.call(client, ref, { signal: controller.signal });
        } catch {
          // Una foto no tumba el catálogo. El shell nuevo devuelve `null`, pero un mock o un shell
          // intermedio puede rechazar: ambos significan «deja las iniciales».
          if (generation !== this.generation || controller.signal.aborted) return;
          continue;
        }
        if (!blob || !blob.type.toLowerCase().startsWith('image/')) continue;
        const url = this.createObjectUrl(blob);
        if (generation !== this.generation || controller.signal.aborted) {
          this.revokeObjectUrl(url);
          continue;
        }
        this.urls.set(ref, url);
        this.notifyChanged();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(Math.max(1, this.concurrency), unique.length) }, () => work()),
    );
  }

  dispose(): void {
    ++this.generation;
    this.controller?.abort();
    this.controller = undefined;
    this.revokeAll();
  }

  private revokeAll(): void {
    if (this.urls.size === 0) return;
    for (const url of this.urls.values()) this.revokeObjectUrl(url);
    this.urls.clear();
    this.notifyChanged();
  }

  /** Como máximo un repintado por frame, aunque terminen muchas de las 280 descargas juntas. */
  private notifyChanged(): void {
    if (this.changeScheduled) return;
    this.changeScheduled = true;
    const flush = (): void => {
      this.changeScheduled = false;
      this.changed();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else queueMicrotask(flush);
  }
}
