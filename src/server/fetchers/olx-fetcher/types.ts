export interface SearchParameter {
  key: string;
  value: string;
}

export interface PriceParamValue {
  __typename: "PriceParam";
  value?: number | null;
  currency?: string | null;
  negotiable?: boolean | null;
}

interface GenericParamValue {
  __typename: "GenericParam";
  key?: string | null;
  label?: string | null;
}

export type ListingParamValue = PriceParamValue | GenericParamValue | { __typename: string };

interface ListingParam {
  key: string;
  value: ListingParamValue | null;
}

export interface RawListing {
  id: number;
  title: string;
  url: string;
  created_time: string;
  location?: {
    city?: { name?: string | null } | null;
    region?: { name?: string | null } | null;
  } | null;
  photos?: Array<{ link?: string | null }> | null;
  description?: string | null;
  user?: {
    name?: string | null;
    created?: string | null;
  } | null;
  params?: ListingParam[] | null;
}

export interface ListingMetadata {
  total_elements?: number;
  visible_total_count?: number;
}

interface ListingLinks {
  next?: { href?: string | null } | null;
}

interface ListingSuccess {
  __typename: "ListingSuccess";
  data: RawListing[];
  metadata?: ListingMetadata;
  links?: ListingLinks;
}

interface ListingErrorPayload {
  code?: string;
  detail?: string;
  title?: string;
}

interface ListingError {
  __typename: "ListingError";
  error?: ListingErrorPayload;
}

type ClientCompatibleListings = ListingSuccess | ListingError;

interface GraphQlError {
  message: string;
}

export interface GraphQlResponse {
  data?: {
    clientCompatibleListings?: ClientCompatibleListings;
  };
  errors?: GraphQlError[];
}