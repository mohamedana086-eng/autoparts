/**
 * The shapes TecDoc puts on the wire.
 * -----------------------------------
 * Everything the rest of the codebase knows about TecAlliance's response
 * format lives here and in `client.ts`. Nothing else imports these types —
 * `map.ts` turns them into our own domain shapes and the import job only
 * ever sees those. When the contract turns out to differ from what is
 * written here, this file and the narrowing in `client.ts` are the only
 * places that need correcting.
 *
 * These were written against the TecDoc Catalogue web service (the
 * `pegasus-3-0` JSON endpoint) as documented in TecAlliance's customer
 * portal. Field names there are not stable across major versions and the
 * portal is the authority — treat every optional field below as genuinely
 * optional and let `map.ts` skip records it cannot read, rather than
 * assuming a field is present because it appears here.
 */

/** Every call answers with a numeric status; 200 is success. */
export interface TecDocEnvelope {
  status?: number;
  statusText?: string;
}

/** A parts brand — TecDoc calls the id a "brandNo", the name a "mfrName". */
export interface TecDocBrand {
  brandNo: number;
  brandName?: string;
  mfrName?: string;
  /** Set on vehicle makers' own brands, which we surface as `isOEM`. */
  isOe?: boolean;
}

/**
 * A node of TecDoc's assembly-group tree (Baugruppe). The tree is deep;
 * we only care about which of our twelve vehicle systems a node sits under,
 * which `map.ts` resolves by walking up to a known root id.
 */
export interface TecDocAssemblyGroup {
  assemblyGroupNodeId: number;
  assemblyGroupName?: string;
  parentNodeId?: number;
}

/** One article's generic-article/assembly-group classification. */
export interface TecDocArticleGroup {
  assemblyGroupNodeId?: number;
  assemblyGroupName?: string;
  genericArticleId?: number;
  genericArticleDescription?: string;
}

/**
 * A number carried by an article. `numberType` distinguishes the article's
 * own number from the OE numbers and competitor references that make up our
 * `Interchange` rows.
 *
 *   0 = the article's own number   1 = OE number
 *   2 = trade number               3 = comparable (competitor) number
 */
export interface TecDocArticleNumber {
  articleNumber: string;
  numberType?: number;
  /** Whose number it is — the vehicle maker for an OE reference. */
  mfrName?: string;
  brandNo?: number;
}

/** A free-form spec line ("Width [mm]: 155"). Folded into the description. */
export interface TecDocArticleAttribute {
  attrName?: string;
  attrValue?: string;
  attrUnit?: string;
}

export interface TecDocArticle {
  /** TecDoc's own id for the article, unique per brand. */
  articleId?: number;
  articleNumber: string;
  brandNo?: number;
  mfrName?: string;
  /** Short marketing name, e.g. "Brake Pad Set, disc brake". */
  articleName?: string;
  genericArticleDescription?: string;
  articleStatus?: number;
  assemblyGroups?: TecDocArticleGroup[];
  articleNumbers?: TecDocArticleNumber[];
  articleAttributes?: TecDocArticleAttribute[];
}

export interface TecDocArticlesResponse extends TecDocEnvelope {
  articles?: TecDocArticle[];
  totalMatchingArticles?: number;
}

// ---------- Vehicles ----------
// TecDoc's hierarchy is manufacturer -> model series -> vehicle type, which
// is exactly the shape of our VehicleMake -> VehicleModel -> VehicleVariant.

export interface TecDocVehicleManufacturer {
  manufacturerId: number;
  manufacturerName: string;
}

export interface TecDocModelSeries {
  modelId: number;
  modelName: string;
  /** TecDoc dates are `YYYYMM` integers; `map.ts` takes the year off. */
  yearOfConstructionFrom?: number;
  yearOfConstructionTo?: number;
}

export interface TecDocVehicleType {
  vehicleId: number;
  /** Engine/body version, e.g. "320d 2.0". */
  typeName?: string;
  modelId?: number;
  manufacturerId?: number;
  engineCodes?: string[];
  powerKw?: number;
  /** TecDoc's fuel wording, e.g. "Diesel"; normalised in `map.ts`. */
  fuelType?: string;
  yearOfConstructionFrom?: number;
  yearOfConstructionTo?: number;
}

export interface TecDocVehiclesResponse extends TecDocEnvelope {
  data?: TecDocVehicleType[];
  totalMatchingVehicles?: number;
}

/** One article-fits-vehicle link — the row that becomes a `Fitment`. */
export interface TecDocLinkedVehicle {
  vehicleId: number;
  /** Restriction text such as "front axle only", kept as the fitment note. */
  linkingTargetInfo?: string;
}

export interface TecDocLinkedVehiclesResponse extends TecDocEnvelope {
  linkedVehicles?: TecDocLinkedVehicle[];
}
