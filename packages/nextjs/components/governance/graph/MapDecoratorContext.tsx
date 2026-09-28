"use client";

import { type ReactNode, createContext, useContext } from "react";
import type { MapDecorator } from "./mapModel";

const MapDecoratorContext = createContext<MapDecorator | undefined>(undefined);

type MapDecoratorProviderProps = { decorate?: MapDecorator; children: ReactNode };

/**
 * The hand-composed layout a host gives the map, provided once so the rail names council members and
 * route steps exactly as the map does. Without a provider, or without a decorator, every screen falls
 * back to the generic names.
 */
export const MapDecoratorProvider = ({ decorate, children }: MapDecoratorProviderProps) => (
  <MapDecoratorContext.Provider value={decorate}>{children}</MapDecoratorContext.Provider>
);

export function useMapDecorator(): MapDecorator | undefined {
  return useContext(MapDecoratorContext);
}
