declare module "/@lib";
declare module "/@lib/*";

declare module "/@fonts" {
  const url: string;
  export default url;
}

declare module "/@fonts/*" {
  const url: string;
  export default url;
}

declare module "virtual:images" {
  export const images: Record<string, Record<string, string>>;
  export const imagesSizes: Record<string, number>;
}
