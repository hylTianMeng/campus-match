import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './context';
import { Layout, PersonalLayout } from './components/Layout';
import { Guard, Empty } from './components/ui';
import { Discover } from './pages/Discover';
import { Auth } from './pages/Auth';
import { Detail } from './pages/Detail';
import { Publish } from './pages/Publish';
import { Posts, Drafts, Applications, Favorites } from './pages/Manage';
import { People, PersonPage } from './pages/People';
import { Profile } from './pages/Profile';
import { Chats, Notices } from './pages/Messages';
export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/discover" replace />} />
            <Route path="discover" element={<Discover />} />
            <Route path="auth" element={<Auth />} />
            <Route path="detail/:id" element={<Detail />} />
            <Route
              path="publish"
              element={
                <Guard>
                  <Publish />
                </Guard>
              }
            />
            <Route
              path="edit/:id"
              element={
                <Guard>
                  <Publish />
                </Guard>
              }
            />
            <Route
              path="drafts"
              element={
                <Guard>
                  <Drafts />
                </Guard>
              }
            />
            <Route
              path="people"
              element={
                <Guard>
                  <People />
                </Guard>
              }
            />
            <Route
              path="person/:id"
              element={
                <Guard>
                  <PersonPage />
                </Guard>
              }
            />
            <Route
              path="chats"
              element={
                <Guard>
                  <Chats />
                </Guard>
              }
            />
            <Route
              path="notices"
              element={
                <Guard>
                  <Notices />
                </Guard>
              }
            />
            <Route
              element={
                <Guard>
                  <PersonalLayout />
                </Guard>
              }
            >
              <Route path="profile" element={<Profile key="profile" />} />
              <Route path="settings" element={<Profile settings key="settings" />} />
              <Route path="posts" element={<Posts />} />
              <Route path="posts/:id/applications" element={<Applications />} />
              <Route path="applications" element={<Applications />} />
              <Route path="teams" element={<Applications team />} />
              <Route path="favorites" element={<Favorites />} />
            </Route>
            <Route path="*" element={<Empty title="页面不存在" />} />
          </Route>
        </Routes>
      </HashRouter>
    </SessionProvider>
  );
}
