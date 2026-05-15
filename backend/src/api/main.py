from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers import auth, fixtures, news, players, portfolio, standings, teams, valuations

app = FastAPI(title="fundXI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(players.router)
app.include_router(fixtures.router)
app.include_router(valuations.router)
app.include_router(news.router)
app.include_router(portfolio.router)
app.include_router(standings.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
