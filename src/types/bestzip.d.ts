declare module "bestzip" {
  interface BestzipOptions {
    cwd?: string;
    destination: string;
    level?: number;
    source: string | string[];
  }

  export default function bestzip(options: BestzipOptions): Promise<void>;
}
