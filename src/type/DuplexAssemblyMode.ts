export enum DuplexAssemblyMode {
  /**
   * PAGE_WISE
   * Front scanned: [1, 3, 5, 7]
   * Back scanned:  [2, 4, 6, 8]
   * Final order:   [1, 2, 3, 4, 5, 6, 7, 8]
   */
  PAGE_WISE = "page-wise",

  /**
   * DOCUMENT_WISE
   * Front scanned: [1, 3, 5, 7]
   * Back scanned (stack flipped): [8, 6, 4, 2]
   * After reversing back: [2, 4, 6, 8]
   * Final order:          [1, 2, 3, 4, 5, 6, 7, 8]
   */
  DOCUMENT_WISE = "document-wise",

  /**
   * REVERSE_FRONT
   * Front scanned (stack flipped): [7, 5, 3, 1]
   * Back scanned:                 [2, 4, 6, 8]
   * After reversing front:        [1, 3, 5, 7]
   * Final order:                 [1, 2, 3, 4, 5, 6, 7, 8]
   */
  REVERSE_FRONT = "reverse-front",

  /**
   * REVERSE_BOTH
   * Front scanned (stack flipped): [7, 5, 3, 1]
   * Back scanned (stack flipped):  [8, 6, 4, 2]
   * After reversing front & back:  [1, 3, 5, 7], [2, 4, 6, 8]
   * Final order:                   [1, 2, 3, 4, 5, 6, 7, 8]
   */
  REVERSE_BOTH = "reverse-both",
}