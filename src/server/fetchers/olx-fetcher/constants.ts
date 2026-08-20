export const LISTING_QUERY = `query ListingSearchQuery(
  $searchParameters: [SearchParameter!] = []
) {
  clientCompatibleListings(searchParameters: $searchParameters) {
    __typename
    ... on ListingSuccess {
      data {
        id
        title
        url
        created_time
        location {
          city { name }
          region { name }
        }
        photos {
          link
        }
        description
        user {
          name
          created
        }
        params {
          key
          value {
            __typename
            ... on PriceParam {
              value
              currency
              negotiable
            }
            ... on GenericParam {
              key
              label
            }
          }
        }
      }
      metadata {
        total_elements
        visible_total_count
      }
      links {
        next { href }
      }
    }
    ... on ListingError {
      error {
        code
        detail
        title
      }
    }
  }
}`;
