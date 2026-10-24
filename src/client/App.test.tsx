// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { api } from './api';

vi.mock('./components/PanoramaViewer', () => ({ PanoramaViewer: ({capture}: {capture?: {id: string}}) => <div data-testid="camera">{capture?.id ?? 'empty'}</div> }));
vi.mock('./api', () => ({ api: {
  session: async () => ({authenticated: true, role: 'viewer'}),
  state: async () => ({
    floors: [{id: 'ground', name: 'Ground floor', sortOrder: 1, planPath: 'ground.svg'}, {id: 'first', name: 'First floor', sortOrder: 2, planPath: 'first.svg'}],
    locations: [
      {id: 'anchor', floorId: 'ground', x: .2, y: .3, label: 'Kitchen'},
      {id: 'near', floorId: 'ground', x: .22, y: .31, label: 'Kitchen doorway'},
      {id: 'far', floorId: 'ground', x: .8, y: .9, label: 'Hallway'},
    ],
    captures: [
      {id: 'latest', locationId: 'anchor', capturedAt: '2026-10-15T12:00:00', title: 'Kitchen today', description: '', tags: [], initialYaw: 0, panoramaPath: '/latest.jpg'},
      {id: 'nearby', locationId: 'near', capturedAt: '2026-09-01T12:00:00', title: 'Kitchen earlier', description: '', tags: [], initialYaw: 0, panoramaPath: '/nearby.jpg'},
      {id: 'distant', locationId: 'far', capturedAt: '2026-09-01T12:00:00', title: 'Hallway earlier', description: '', tags: [], initialYaw: 0, panoramaPath: '/distant.jpg'},
    ],
  }),
}}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openArchive() {
  render(<App />);
  await screen.findByRole('button', {name: 'Kitchen: Kitchen today'});
}

describe('camera workspace', () => {
  it('opens a camera automatically and selects the closest point while scrubbing', async () => {
    await openArchive();
    expect(screen.getByTestId('camera').textContent).toBe('latest');
    fireEvent.click(screen.getByRole('button', {name: 'Previous capture date'}));
    expect(screen.getByTestId('camera').textContent).toBe('nearby');
    fireEvent.click(screen.getByRole('button', {name: 'Next capture date'}));
    expect(screen.getByTestId('camera').textContent).toBe('latest');
  });
  it('keeps the timeline available through expansion, collapse, and camera focus', async () => {
    await openArchive();
    fireEvent.click(screen.getByRole('button', {name: 'Expand map'}));
    expect(screen.getByRole('button', {name: 'Shrink map'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Collapse map'}));
    expect(screen.queryByRole('region', {name: 'Floor map panel'})).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Focus camera'}));
    expect(screen.getByRole('slider', {name: 'Construction day'})).toBeTruthy();
    expect(screen.getByTestId('camera').textContent).toBe('latest');
    fireEvent.click(screen.getByRole('button', {name: 'Restore panels'}));
    fireEvent.click(screen.getByRole('button', {name: 'Floor map'}));
    expect(screen.getByRole('region', {name: 'Floor map panel'})).toBeTruthy();
  });
  it('lets keyboard users navigate between dates across gaps', async () => {
    await openArchive();
    fireEvent.keyDown(screen.getByRole('slider', {name: 'Construction day'}), {key: 'ArrowLeft'});
    expect(screen.getByTestId('camera').textContent).toBe('nearby');
    fireEvent.keyDown(screen.getByRole('slider', {name: 'Construction day'}), {key: 'End'});
    expect(screen.getByTestId('camera').textContent).toBe('latest');
  });
  it('picks up tool updates when returning to the browser without changing the selected date', async () => {
    const read = vi.spyOn(api, 'state');
    await openArchive();
    fireEvent.click(screen.getByRole('button', {name: 'Previous capture date'}));
    fireEvent.focus(window);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('camera').textContent).toBe('nearby');
  });
  it('shows an empty camera on a floor with no captures, with navigation still available', async () => {
    await openArchive();
    fireEvent.click(screen.getByRole('button', {name: 'First floor'}));
    expect(screen.getByTestId('camera').textContent).toBe('empty');
    expect(screen.getByRole('slider', {name: 'Construction day'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Ground floor'}));
    expect(screen.getByTestId('camera').textContent).toBe('latest');
  });
});
