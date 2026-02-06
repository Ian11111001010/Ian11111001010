.PHONY: run run-bg stop docker-up docker-down

run:
	python3 -m http.server 8000 --bind 127.0.0.1

run-bg:
	nohup python3 -m http.server 8000 --bind 127.0.0.1 > .server.log 2>&1 & echo $$! > .server.pid
	@echo "Server started on http://localhost:8000 (PID $$(cat .server.pid))"

stop:
	@if [ -f .server.pid ]; then kill $$(cat .server.pid) && rm -f .server.pid; fi
	@echo "Server stopped"

docker-up:
	docker compose up -d --build
	@echo "Open http://localhost:8080"

docker-down:
	docker compose down
