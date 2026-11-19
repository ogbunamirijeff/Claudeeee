// Metro resolves image imports to a numeric asset id usable as an <Image source>.
declare module '*.webp' {
  const asset: number;
  export default asset;
}
declare module '*.png' {
  const asset: number;
  export default asset;
}
