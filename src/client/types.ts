export type Floor = {
  id: 'basement' | 'ground' | 'first';
  name: string;
  sortOrder: number;
  planPath: string;
};

export type Location = {
  id: string;
  floorId: Floor['id'];
  x: number;
  y: number;
  label: string;
};

export type Capture = {
  id: string;
  locationId: string;
  title: string;
  description: string;
  capturedAt: string;
  panoramaPath: string | null;
  originalFilename: string | null;
  initialYaw: number;
  tags: string[];
};

export type AppState = {
  floors: Floor[];
  locations: Location[];
  captures: Capture[];
};
