import { createContext, useContext } from 'react';

// { session, profile, isTutor, toast(text, kind), bump() }
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
