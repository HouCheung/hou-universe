@echo off
cd /d D:\123\HOU Universe
REM Phase 96 - augmentation transfer experiment. This launcher TRAINS the treatment arm.
REM `call` is required: npx is a .cmd shim, and without `call` the batch
REM file would exit immediately after launching it.
set STAGE=%1
if "%STAGE%"=="" set STAGE=all
call npx --yes tsx experiments/phase96/probe.ts --stage=%STAGE% >> experiments/phase96/probe.log 2>&1
echo PHASE96_EXIT=%ERRORLEVEL% >> experiments/phase96/probe.log
