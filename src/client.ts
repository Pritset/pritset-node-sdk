import { DocumentsClient } from "./documents.js";
import { TemplatesClient } from "./templates.js";
import { Transport } from "./transport.js";
import type { PritsetClientOptions } from "./types.js";

export class PritsetClient {
  public readonly templates: TemplatesClient;
  public readonly documents: DocumentsClient;

  public constructor(options: PritsetClientOptions) {
    const transport = new Transport(options);
    this.templates = new TemplatesClient(transport);
    this.documents = new DocumentsClient(transport);
  }
}
