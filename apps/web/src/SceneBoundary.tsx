import { Component, type ReactNode } from 'react';

/**
 * Renders `fallback` if a 3D scene throws while mounting (renderer creation fails, a context is
 * refused). Without it one scene's failure unmounts the whole site; with it the core switches to
 * text mode and the visitor keeps their place.
 */
export class SceneBoundary extends Component<{ fallback: ReactNode; onError(): void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
